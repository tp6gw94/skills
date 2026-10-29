---
name: mcp-atlassian-attachments
description: Upload Jira attachments and write issue descriptions through mcp-atlassian. Use when attaching files or screenshots to a Jira issue, or when writing a description with jira_create_issue or jira_update_issue.
---

# Jira attachments through mcp-atlassian

## Upload attachments

`jira_update_issue` uploads files from its `attachments` argument, but only from inside the server's allowed root: the session working directory (usually the repository root). A path outside it, such as `/tmp/...`, fails with `Path traversal detected: <path> resolves outside <root>`. The call still returns `isError: false` and applies any `fields` change; the failure appears only in `attachment_results.failed`.

1. Stage the files inside the allowed root. Create a new, empty directory there such as `<root>/.tmp-<issue-key>-attach/` (check the name is free first) and copy the files in with descriptive names.
2. Upload in a dedicated call, with absolute paths joined by commas:
   ```js
   await tools.mcp__mcp_atlassian__jira_update_issue({
     issue_key: "<KEY>",
     fields: "{}",
     attachments: "<root>/.tmp-<KEY>-attach/a.png,<root>/.tmp-<KEY>-attach/b.png",
   });
   ```
   `jira_update_issue` rejects `fields_to_return`; leave it out.
3. Parse the response and read `issue.attachment_results`: done when every file is in `uploaded` and `failed` is empty. On a `failed` entry, fix its cause and re-upload only the failed files, since the uploaded ones are already on the issue.
4. Confirm on Jira: `jira_get_issue_images` reports `total_images` for image files; `jira_download_attachments` covers other types. `jira_get_issue` omits attachments, so its output proves nothing here.
5. Delete the staging directory and run `git status` to confirm the working tree is clean.

## Write descriptions

Descriptions take Markdown and are converted to Jira markup:

- Every `ABC-12` pattern becomes an issue link, including document and rule IDs such as `FRD-01`, `US-07`, `BR-13`. Write real issue keys as plain text; put other IDs inside a code span or reword them (for example, link the source page with descriptive link text).
- Square brackets in plain text are consumed as link syntax, so `[QA] name` loses `[QA]`. Put bracketed literals inside a code span.
- Read the description back with `jira_get_issue` after writing it and check the converted links and literals.
