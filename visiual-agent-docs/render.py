#!/usr/bin/env python3
"""Render an explicit visual-agent-docs JSON manifest as one offline HTML file."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Optional, Tuple

CONTRACT_VERSION = "1"
PLAN_TASK_RELATION_TYPE = "plan-task"
TOY_CSP = (
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; "
    "style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; "
    "connect-src 'none'; navigate-to 'none'; child-src 'none'; frame-src 'none'; base-uri 'none'; "
    "form-action 'none'; object-src 'none'\">"
)


class ManifestError(ValueError):
    """An input error that should be shown as a concise CLI diagnostic."""


def _text(value: Any, field: str, *, required: bool = False) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str) or (required and not value.strip()):
        raise ManifestError(f"{field} must be a non-empty string")
    return value


def _string_list(value: Any, field: str) -> List[str]:
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ManifestError(f"{field} must be an array of strings")
    return value


def _glossary(raw: Any, field: str) -> List[Dict[str, str]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ManifestError(f"{field} must be an array of {{term, plain}} objects")
    entries: List[Dict[str, str]] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise ManifestError(f"{field}[{index}] must be an object with term and plain")
        entries.append(
            {
                "term": _text(entry.get("term"), f"{field}[{index}].term", required=True),
                "plain": _text(entry.get("plain"), f"{field}[{index}].plain", required=True),
            }
        )
    return entries


def _safe_relative_path(raw: Any) -> str:
    path = _text(raw, "document path", required=True)
    if "\\" in path or "\x00" in path:
        raise ManifestError("document path must be a relative POSIX path")
    posix = PurePosixPath(path)
    if posix.is_absolute() or not posix.parts or any(part in ("", ".", "..") for part in posix.parts):
        raise ManifestError(f"document path must stay below the selected source root: {path}")
    return posix.as_posix()


def _source_lines(raw: Any, content_lines: List[str], field: str) -> Tuple[Dict[str, Any], Optional[str]]:
    if not isinstance(raw, dict):
        return {"anchor": "", "lines": [], "excerpt": ""}, f"{field} is missing a source line range"
    anchor = raw.get("anchor", "")
    if not isinstance(anchor, str):
        return {"anchor": "", "lines": [], "excerpt": ""}, f"{field} source.anchor must be a string"
    lines = raw.get("lines")
    if (
        not isinstance(lines, list)
        or len(lines) != 2
        or any(isinstance(n, bool) or not isinstance(n, int) for n in lines)
    ):
        return {"anchor": anchor, "lines": [], "excerpt": ""}, f"{field} source.lines must be [start line, end line]"
    start, end = lines
    if start < 1 or end < start or end > len(content_lines):
        return {"anchor": anchor, "lines": [start, end], "excerpt": ""}, (
            f"{field} source line range {start}-{end} is outside file range 1-{len(content_lines)}"
        )
    excerpt = "\n".join(content_lines[start - 1 : end])
    warning = None
    if anchor and anchor not in excerpt:
        warning = f"{field} source.anchor is not in the selected excerpt"
    return {"anchor": anchor, "lines": [start, end], "excerpt": excerpt}, warning


def _slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^\w\u3400-\u9fff]+", "-", value, flags=re.UNICODE).strip("-")
    return value or "item"


def _derived_item_id(kind: str, title: str, source: Dict[str, Any]) -> str:
    anchor = source.get("anchor") or title
    lines = source.get("lines") or []
    line = lines[0] if lines and isinstance(lines[0], int) else "unknown"
    return f"{kind}:{_slug(anchor)}:{line}"


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _read_selected(root: Path, relative_path: str) -> Tuple[str, str]:
    root = root.resolve()
    candidate = (root / Path(relative_path)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ManifestError(f"document path is outside the source root: {relative_path}") from exc
    if not candidate.is_file():
        raise ManifestError(f"cannot read selected document: {relative_path}")
    raw = candidate.read_bytes()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ManifestError(f"document is not UTF-8: {relative_path}") from exc
    return content, _sha256(raw)


def _normalize_diagram(raw: Any, field: str) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ManifestError(f"{field} diagram must be an object")
    raw_nodes = raw.get("nodes", [])
    raw_edges = raw.get("edges", [])
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        raise ManifestError(f"{field} diagram.nodes/edges must be arrays")
    layout = raw.get("layout", "auto")
    if layout not in ("auto", "flow", "mapping"):
        layout = "auto"
    nodes: List[Dict[str, str]] = []
    seen_nodes = set()
    for index, node in enumerate(raw_nodes):
        if not isinstance(node, dict):
            raise ManifestError(f"{field} diagram.nodes[{index}] must be an object")
        node_id = _text(node.get("id"), f"{field} diagram.nodes[{index}].id", required=True)
        label = _text(node.get("label"), f"{field} diagram.nodes[{index}].label", required=True)
        if node_id in seen_nodes:
            raise ManifestError(f"{field} diagram node id is duplicated: {node_id}")
        seen_nodes.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "label": label,
                "description": _text(node.get("description"), "node.description"),
                "lane": _text(node.get("lane"), "node.lane"),
            }
        )
    edges: List[Dict[str, str]] = []
    for index, edge in enumerate(raw_edges):
        if not isinstance(edge, dict):
            raise ManifestError(f"{field} diagram.edges[{index}] must be an object")
        source = _text(edge.get("from"), f"{field} diagram.edges[{index}].from", required=True)
        target = _text(edge.get("to"), f"{field} diagram.edges[{index}].to", required=True)
        label = _text(edge.get("label"), f"{field} diagram.edges[{index}].label", required=True)
        edges.append({"from": source, "to": target, "label": label})
    return {
        "title": _text(raw.get("title"), f"{field} diagram.title") or "Explanatory diagram",
        "layout": layout,
        "nodes": nodes,
        "edges": edges,
    }


def _with_toy_csp(html: str) -> str:
    # The iframe is sandboxed without same-origin, forms, popups, or navigation.
    # A restrictive CSP in srcdoc also blocks network and embedded resource loads.
    if re.search(r"<head(?:\s[^>]*)?>", html, flags=re.IGNORECASE):
        return re.sub(r"(<head(?:\s[^>]*)?>)", r"\1" + TOY_CSP, html, count=1, flags=re.IGNORECASE)
    return TOY_CSP + html


def _normalize_toys(raw: Any, errors: List[str]) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ManifestError("toys must be an array")
    toys: List[Dict[str, Any]] = []
    seen = set()
    for index, toy in enumerate(raw):
        field = f"toys[{index}]"
        if not isinstance(toy, dict):
            raise ManifestError(f"{field} must be an object")
        toy_id = _text(toy.get("id"), f"{field}.id", required=True)
        if toy_id in seen:
            errors.append(f"{field} id is duplicated: {toy_id}; this toy cannot be referenced")
            continue
        seen.add(toy_id)
        html = _text(toy.get("html"), f"{field}.html", required=True)
        toys.append(
            {
                "id": toy_id,
                "title": _text(toy.get("title"), f"{field}.title") or "Synthetic toy",
                "description": _text(toy.get("description"), f"{field}.description"),
                "synthetic": True,
                "html": _with_toy_csp(html),
            }
        )
    return toys


def _doc_id(source_root: str, relative_path: str, supplied: Any, errors: List[str], field: str) -> str:
    expected = f"{source_root}:{relative_path}"
    if supplied is not None:
        supplied_id = _text(supplied, f"{field}.docId", required=True)
        if supplied_id != expected:
            errors.append(f"{field} docId does not match sourceRoot/path; using {expected}")
    return expected


def _normalize_item(
    raw: Any,
    *,
    kind: str,
    doc_id: str,
    relative_path: str,
    source_version: str,
    content_lines: List[str],
    index: int,
    used_ids: Dict[str, int],
    errors: List[str],
) -> Dict[str, Any]:
    field = f"{doc_id}.items[{index}]"
    if not isinstance(raw, dict):
        raise ManifestError(f"{field} must be an object")
    title = _text(raw.get("title"), f"{field}.title", required=True)
    source, source_issue = _source_lines(raw.get("source"), content_lines, field)
    if source_issue:
        errors.append(source_issue)
    supplied_id = raw.get("itemId", raw.get("id"))
    explicit = bool(isinstance(supplied_id, str) and supplied_id.strip())
    if supplied_id is not None and not explicit:
        errors.append(f"{field} itemId must be a non-empty string; notes are disabled for this item")
    item_id = _text(supplied_id, f"{field}.itemId", required=True) if explicit else _derived_item_id(kind, title, source)
    invalid_id = supplied_id is not None and not explicit
    duplicate_id = item_id in used_ids
    mapping_error = duplicate_id or invalid_id
    if duplicate_id:
        errors.append(f"{field} itemId is duplicated: {item_id}; note mapping is disabled for this item")
    else:
        used_ids[item_id] = index
    boundary = raw.get("boundary", raw.get("scope", "unknown"))
    if boundary not in ("in", "out", "unknown"):
        errors.append(f"{field} boundary only supports in/out/unknown; using unknown")
        boundary = "unknown"
    order = raw.get("order", index)
    if isinstance(order, bool) or not isinstance(order, (int, float)):
        errors.append(f"{field} order must be numeric; using input order")
        order = index
    return {
        "itemId": item_id,
        "explicitId": explicit,
        "mappingError": mapping_error,
        "stableKey": "" if mapping_error else f"{doc_id}::{item_id}",
        "uiKey": f"{doc_id}::__invalid__{index}" if mapping_error else f"{doc_id}::{item_id}",
        "title": title,
        "kind": kind,
        "boundary": boundary,
        "summary": _text(raw.get("summary"), f"{field}.summary"),
        "example": _text(raw.get("example"), f"{field}.example"),
        "glossary": _glossary(raw.get("glossary"), f"{field}.glossary"),
        "details": _text(raw.get("details"), f"{field}.details"),
        "acceptance": _string_list(raw.get("acceptance"), f"{field}.acceptance"),
        "risks": _string_list(raw.get("risks"), f"{field}.risks"),
        "questions": _string_list(raw.get("questions"), f"{field}.questions"),
        "status": _text(raw.get("status"), f"{field}.status"),
        "order": order,
        "source": {
            "docId": doc_id,
            "path": relative_path,
            "sourceVersion": source_version,
            "anchor": source["anchor"],
            "lines": source["lines"],
            "excerpt": source["excerpt"],
            "issue": source_issue or "",
        },
        "pseudocode": _text(raw.get("pseudocode", raw.get("pseudoCode")), f"{field}.pseudocode"),
        "diagram": _normalize_diagram(raw.get("diagram"), field),
        "toyId": _text(raw.get("toyId"), f"{field}.toyId"),
    }


def _endpoint(raw: Any, field: str) -> Tuple[str, str]:
    if not isinstance(raw, dict):
        raise ManifestError(f"{field} must be an object with docId and itemId")
    return (
        _text(raw.get("docId"), f"{field}.docId", required=True),
        _text(raw.get("itemId"), f"{field}.itemId", required=True),
    )


def build_model(payload: Any, root: Path) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ManifestError("manifest top level must be a JSON object")
    source_root = _text(payload.get("sourceRoot"), "sourceRoot", required=True)
    raw_documents = payload.get("documents")
    if not isinstance(raw_documents, list) or not raw_documents:
        raise ManifestError("documents must be a non-empty array")

    errors: List[str] = []
    documents: List[Dict[str, Any]] = []
    seen_doc_ids = set()
    all_items: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for doc_index, raw_doc in enumerate(raw_documents):
        field = f"documents[{doc_index}]"
        if not isinstance(raw_doc, dict):
            raise ManifestError(f"{field} must be an object")
        kind = _text(raw_doc.get("kind"), f"{field}.kind", required=True).lower()
        if kind not in ("spec", "plan", "todo"):
            raise ManifestError(f"{field}.kind only supports spec, plan, or todo")
        try:
            relative_path = _safe_relative_path(raw_doc.get("path"))
            content, source_version = _read_selected(root, relative_path)
        except ManifestError as exc:
            errors.append(f"{field}: {exc}")
            continue
        doc_id = _doc_id(source_root, relative_path, raw_doc.get("docId"), errors, field)
        if doc_id in seen_doc_ids:
            errors.append(f"{field} docId is duplicated: {doc_id}; duplicate document skipped")
            continue
        seen_doc_ids.add(doc_id)
        content_lines = content.splitlines()
        used_ids: Dict[str, int] = {}
        raw_items = raw_doc.get("items", [])
        if not isinstance(raw_items, list):
            raise ManifestError(f"{field}.items must be an array")
        items = [
            _normalize_item(
                item,
                kind=kind,
                doc_id=doc_id,
                relative_path=relative_path,
                source_version=source_version,
                content_lines=content_lines,
                index=index,
                used_ids=used_ids,
                errors=errors,
            )
            for index, item in enumerate(raw_items)
        ]
        for index, item in enumerate(items):
            if sum(candidate["itemId"] == item["itemId"] for candidate in items) > 1:
                item.update(mappingError=True, stableKey="", uiKey=f"{doc_id}::__invalid__{index}")
        items.sort(key=lambda item: item["order"])
        document = {
            "docId": doc_id,
            "sourceRoot": source_root,
            "path": relative_path,
            "kind": kind,
            "sourceVersion": source_version,
            "lineCount": len(content_lines),
            "items": items,
        }
        documents.append(document)
        for item in items:
            all_items.setdefault((doc_id, item["itemId"]), []).append(item)

    if not documents:
        raise ManifestError("no readable source documents; stopping without producing a review page")
    if not any(document["items"] for document in documents):
        raise ManifestError("no readable source items; stopping without producing a review page")

    raw_relations = payload.get("relations", [])
    if not isinstance(raw_relations, list):
        raise ManifestError("relations must be an array")
    relations: List[Dict[str, Any]] = []
    mapped_pairs: set[Tuple[str, str]] = set()
    for index, raw_relation in enumerate(raw_relations):
        field = f"relations[{index}]"
        if not isinstance(raw_relation, dict):
            raise ManifestError(f"{field} must be an object")
        endpoint_errors: List[str] = []
        try:
            source_endpoint = _endpoint(raw_relation.get("from"), f"{field}.from")
        except ManifestError as exc:
            source_endpoint = ("", "")
            endpoint_errors.append(str(exc))
        try:
            target_endpoint = _endpoint(raw_relation.get("to"), f"{field}.to")
        except ManifestError as exc:
            target_endpoint = ("", "")
            endpoint_errors.append(str(exc))
        source_items = all_items.get(source_endpoint, [])
        target_items = all_items.get(target_endpoint, [])
        issue = "; ".join(endpoint_errors)
        endpoint_ok = len(source_items) == 1 and len(target_items) == 1
        from_key = source_items[0]["stableKey"] if len(source_items) == 1 else ""
        to_key = target_items[0]["stableKey"] if len(target_items) == 1 else ""
        if not endpoint_ok:
            issue = issue or f"{field} endpoints could not be resolved uniquely; relationship not drawn"
            errors.extend(endpoint_errors)
            if not endpoint_errors:
                errors.append(issue)
        elif source_items[0]["mappingError"] or target_items[0]["mappingError"]:
            issue = f"{field} endpoints contain duplicate mappings; relationship not drawn"
            from_key = to_key = ""
            errors.append(issue)

        relation_type = ""
        if "type" in raw_relation:
            try:
                relation_type = _text(raw_relation.get("type"), f"{field}.type", required=True)
            except ManifestError as exc:
                issue = f"{issue}; {exc}" if issue else str(exc)
                errors.append(str(exc))

        source_kind = source_items[0]["kind"] if len(source_items) == 1 else ""
        target_kind = target_items[0]["kind"] if len(target_items) == 1 else ""
        if relation_type == PLAN_TASK_RELATION_TYPE:
            if endpoint_ok and not (source_items[0]["mappingError"] or target_items[0]["mappingError"]):
                if source_kind != "plan" or target_kind != "todo":
                    issue = f"{field} type=plan-task must point from plan to todo; mapping not created"
                    errors.append(issue)
                    from_key = to_key = ""
                elif (from_key, to_key) in mapped_pairs:
                    issue = f"{field} plan-task mapping is duplicated; second mapping not created"
                    errors.append(issue)
                    from_key = to_key = ""
            else:
                from_key = to_key = ""
        elif {source_kind, target_kind} == {"plan", "todo"}:
            issue = f"{field} plan/todo relationship must explicitly use type=plan-task; mapping not created"
            errors.append(issue)
            from_key = to_key = ""

        relation_source = None
        relation_source_issue = ""
        if raw_relation.get("source") is not None:
            raw_relation_source = raw_relation.get("source")
            if not isinstance(raw_relation_source, dict):
                relation_source_issue = f"{field}.source must be an object"
                relation_source = {"docId": "", "path": "", "sourceVersion": "", "anchor": "", "lines": [], "excerpt": "", "issue": relation_source_issue}
                errors.append(relation_source_issue)
                raw_relation_source = None
            source_doc_id = ""
            if raw_relation_source is not None:
                try:
                    source_doc_id = _text(raw_relation_source.get("docId"), f"{field}.source.docId", required=True)
                except ManifestError as exc:
                    relation_source_issue = str(exc)
                    relation_source = {"docId": "", "path": "", "sourceVersion": "", "anchor": "", "lines": [], "excerpt": "", "issue": relation_source_issue}
                    errors.append(relation_source_issue)
            source_doc = next((doc for doc in documents if doc["docId"] == source_doc_id), None)
            if source_doc:
                source_content_lines = []
                try:
                    source_content, _ = _read_selected(root, source_doc["path"])
                    source_content_lines = source_content.splitlines()
                except ManifestError:
                    pass
                relation_source, relation_issue_from_source = _source_lines(raw_relation.get("source"), source_content_lines, field)
                relation_source_issue = relation_issue_from_source or ""
                if relation_type == PLAN_TASK_RELATION_TYPE:
                    try:
                        _text(raw_relation_source.get("anchor"), f"{field}.source.anchor", required=True)
                    except ManifestError as exc:
                        relation_source_issue = f"{relation_source_issue}; {exc}" if relation_source_issue else str(exc)
                if relation_source_issue:
                    errors.append(relation_source_issue)
                relation_source.update({"docId": source_doc["docId"], "path": source_doc["path"], "sourceVersion": source_doc["sourceVersion"], "issue": relation_source_issue})
            elif relation_source is None:
                relation_source_issue = f"{field} source points to an unselected document"
                errors.append(relation_source_issue)
                relation_source = {"docId": "", "path": "", "sourceVersion": "", "anchor": "", "lines": [], "excerpt": "", "issue": "Source could not be resolved"}
        elif relation_type == PLAN_TASK_RELATION_TYPE:
            relation_source_issue = f"{field} type=plan-task is missing a source anchor"
            errors.append(relation_source_issue)
        if relation_source_issue:
            issue = f"{issue}; {relation_source_issue}" if issue else relation_source_issue

        try:
            relation_label = _text(raw_relation.get("label"), f"{field}.label") or "Relationship"
        except ManifestError as exc:
            relation_label = "Relationship"
            errors.append(str(exc))
            issue = f"{issue}; {exc}" if issue else str(exc)
        if relation_type == PLAN_TASK_RELATION_TYPE and not issue:
            mapped_pairs.add((from_key, to_key))
        relations.append(
            {
                "from": {"docId": source_endpoint[0], "itemId": source_endpoint[1]},
                "to": {"docId": target_endpoint[0], "itemId": target_endpoint[1]},
                "type": relation_type,
                "fromKey": from_key if not issue else "",
                "toKey": to_key if not issue else "",
                "label": relation_label,
                "source": relation_source,
                "issue": issue,
            }
        )

    toys = _normalize_toys(payload.get("toys"), errors)
    toy_ids = {toy["id"] for toy in toys}
    for doc in documents:
        for item in doc["items"]:
            if item["toyId"] and item["toyId"] not in toy_ids:
                errors.append(f"{item['stableKey'] or item['itemId']} points to a missing toy: {item['toyId']}")

    snapshot_material = {
        "contractVersion": CONTRACT_VERSION,
        "documents": sorted(
            [{"docId": doc["docId"], "sourceVersion": doc["sourceVersion"]} for doc in documents],
            key=lambda doc: doc["docId"],
        ),
    }
    snapshot_id = _sha256(_canonical_json(snapshot_material))
    return {
        "contractVersion": CONTRACT_VERSION,
        "renderer": "visual-agent-docs",
        "title": _text(payload.get("title"), "title") or "Document review",
        "summary": _text(payload.get("summary"), "summary"),
        "sourceRoot": source_root,
        "snapshotId": snapshot_id,
        "documents": documents,
        "relations": relations,
        "toys": toys,
        "errors": errors,
    }


def _json_for_script(model: Dict[str, Any]) -> str:
    value = json.dumps(model, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    # Keep untrusted source text inside the JSON data element, never as markup.
    return (
        value.replace("&", r"\u0026")
        .replace("<", r"\u003c")
        .replace(">", r"\u003e")
        .replace("\u2028", r"\u2028")
        .replace("\u2029", r"\u2029")
    )


def render_manifest(manifest_path: Path, output_path: Path, root: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ManifestError(f"cannot read manifest: {manifest_path}") from exc
    except json.JSONDecodeError as exc:
        raise ManifestError(f"manifest is not valid JSON: line {exc.lineno}") from exc
    model = build_model(payload, root)
    template_path = Path(__file__).resolve().parent / "assets" / "template.html"
    template = template_path.read_text(encoding="utf-8")
    marker = "__REVIEW_DATA__"
    if template.count(marker) != 1:
        raise ManifestError("template must contain exactly one data slot")
    output = template.replace(marker, _json_for_script(model))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")
    return model


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="將明確選定的文件資料 render 成離線檢閱 HTML")
    parser.add_argument("manifest", type=Path, help="JSON manifest")
    parser.add_argument("output", type=Path, help="輸出的單檔 HTML")
    parser.add_argument("--root", type=Path, required=True, help="選定來源文件的根目錄")
    args = parser.parse_args(argv)
    try:
        model = render_manifest(args.manifest, args.output, args.root)
    except (ManifestError, OSError) as exc:
        print(f"visual-agent-docs: {exc}", file=sys.stderr)
        return 2
    print(f"Rendered {args.output} ({model['snapshotId']})")
    if model["errors"]:
        print(f"Warning: {len(model['errors'])} data items need review in the page", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
