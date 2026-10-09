import assert from 'node:assert/strict'
import test from 'node:test'
import { mountViewerChrome } from '../assets/toolbar.mjs'

class DOMEvent {
  constructor(type, options = {}) {
    Object.assign(this, { type, bubbles: true, key: '', defaultPrevented: false }, options)
  }

  stopPropagation() {
    this.stopped = true
  }

  preventDefault() {
    this.defaultPrevented = true
  }
}

class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.parentNode = null
    this.attributes = new Map()
    this.listeners = new Map()
    this.hidden = false
    this.disabled = false
    this.style = { display: '', removeProperty(name) { this[name] = '' } }
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ') },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ') },
      toggle: (name, force) => {
        const on = force ?? !this.classList.contains(name)
        this.classList[on ? 'add' : 'remove'](name)
        return on
      }
    }
  }

  get className() { return this.getAttribute('class') || '' }
  set className(value) { this.setAttribute('class', value) }
  get id() { return this.getAttribute('id') || '' }
  set id(value) { this.setAttribute('id', value) }
  get title() { return this.getAttribute('title') || '' }
  set title(value) { this.setAttribute('title', value) }
  get parentElement() { return this.parentNode }
  get firstChild() { return this.children[0] || null }
  get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null }
  get previousElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) - 1] || null }
  get textContent() { return this.text || this.children.map(child => child.textContent).join('') }
  set textContent(value) {
    for (const child of this.children) child.parentNode = null
    this.children = []
    this.text = String(value)
  }

  set innerHTML(value) {
    throw new Error(`Fixture forbids HTML parsing: ${value}`)
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }

  appendChild(child) { return this.insertBefore(child, null) }

  insertBefore(child, anchor) {
    if (anchor && anchor.parentNode !== this) throw new Error('Invalid insertion anchor')
    child.remove()
    const index = anchor ? this.children.indexOf(anchor) : this.children.length
    this.children.splice(index, 0, child)
    child.parentNode = this
    this.text = ''
    return child
  }

  replaceChild(child, oldChild) {
    this.insertBefore(child, oldChild)
    oldChild.remove()
    return oldChild
  }

  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    siblings.splice(siblings.indexOf(this), 1)
    this.parentNode = null
  }

  contains(node) {
    return this === node || this.children.some(child => child.contains(node))
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1))
    const match = selector.match(/^([\w-]+)(?:\[([\w-]+)="([^"]*)"\])?$/)
    if (!match) throw new Error(`Unsupported fixture selector: ${selector}`)
    return this.tagName === match[1].toUpperCase() && (!match[2] || this.getAttribute(match[2]) === match[3])
  }

  querySelectorAll(selector) {
    return this.children.flatMap(child => [ ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector) ])
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }

  addEventListener(type, callback, options = false) {
    const capture = typeof options === 'boolean' ? options : Boolean(options.capture)
    const listeners = this.listeners.get(type) || []
    if (!listeners.some(item => item.callback === callback && item.capture === capture)) listeners.push({ callback, capture })
    this.listeners.set(type, listeners)
  }

  dispatchEvent(event) {
    event.target = this
    const path = []
    for (let node = this; node; node = node.parentNode) path.push(node)
    const invoke = (node, capture) => {
      event.currentTarget = node
      for (const item of [...(node.listeners.get(event.type) || [])]) {
        if (item.capture === capture) item.callback.call(node, event)
      }
    }
    for (const node of [...path].reverse()) {
      invoke(node, true)
      if (event.stopped) return !event.defaultPrevented
    }
    invoke(this, false)
    if (event.bubbles && !event.stopped) {
      for (const node of path.slice(1)) {
        invoke(node, false)
        if (event.stopped) break
      }
    }
    return !event.defaultPrevented
  }

  click() {
    if (this.disabled) return
    const activation = this.ownerDocument.userActivation
    const previous = activation.active
    activation.active = true
    try { this.dispatchEvent(new DOMEvent('click')) } finally { activation.active = previous }
  }
}

class Document extends Element {
  constructor() {
    super('#document', null)
    this.ownerDocument = this
    this.userActivation = { active: false }
  }

  createElement(tag) { return new Element(tag, this) }
  createElementNS(namespace, tag) {
    const element = this.createElement(tag)
    element.namespaceURI = namespace
    return element
  }
}

function fixture({ selection = false, omit = '', incompatibleMenu = false } = {}) {
  const document = new Document()
  const window = new Element('window', document)
  window.appendChild(document)
  const make = (tag, className = '', text = '') => {
    const element = document.createElement(tag)
    element.className = className
    element.textContent = text
    return element
  }
  const root = make('div', 'qd-root')
  document.appendChild(root)
  const ui = make('div', 'qd-ui')
  const dock = make('div', 'qd-dock')
  if (omit !== 'ui') root.appendChild(ui)
  if (omit !== 'dock') ui.appendChild(dock)
  const tools = ['select', 'draw', 'styles', 'more'].map(name => {
    const button = make('button', 'qd-tool', name)
    button.setAttribute('data-name', name)
    dock.appendChild(button)
    return button
  })
  const menuButton = make('button', 'qd-tool')
  menuButton.setAttribute('data-name', 'menu')
  if (omit !== 'menu') dock.appendChild(menuButton)
  const header = make('div')
  document.appendChild(header)
  const controls = { selector: make('select'), input: make('input') }
  const option = make('option', '', 'Current board')
  option.setAttribute('value', 'board-1')
  controls.selector.appendChild(option)
  controls.selector.value = 'board-1'
  const labels = { read: 'Read board', save: 'Save board', fullscreen: 'Fullscreen', png: 'Export editable PNG', fit: 'Fit board' }
  for (const [name, label] of Object.entries(labels)) controls[name] = make('button', '', label)
  for (const [name, control] of Object.entries(controls)) {
    control.id = `viewer-${name}`
    control.hidden = true
    control.style.display = 'none'
    header.appendChild(control)
  }
  const nativeActions = []
  const shortcuts = []
  root.addEventListener('keydown', event => shortcuts.push(`capture:${event.key}`), true)
  root.addEventListener('keydown', event => shortcuts.push(`bubble:${event.key}`))
  let popover = null
  const closeNative = () => {
    if (popover) popover.remove()
    popover = null
    menuButton.classList.remove('on')
  }
  menuButton.addEventListener('click', event => {
    event.stopPropagation()
    if (popover) return closeNative()
    popover = make('div', 'qd-popover qd-menu-pop')
    const item = (label, { close = true, className = 'qd-menu-item' } = {}) => {
      const row = make('button', className)
      row.appendChild(make('span', 'qd-mi-label', label))
      row.addEventListener('click', event => {
        event.stopPropagation()
        if (close) closeNative()
        nativeActions.push(label)
      })
      popover.appendChild(row)
      return row
    }
    item(incompatibleMenu ? 'Unknown export' : 'Export as PNG')
    item('Export — transparent')
    if (selection) item('Export selection')
    item(selection ? 'Copy selection as image' : 'Copy as image')
    popover.appendChild(make('i', 'qd-menu-div'))
    if (selection) item('Delete selection')
    item('Zoom to fit')
    item('Clear board')
    popover.appendChild(make('i', 'qd-menu-div'))
    const grid = item('Grid', { close: false })
    const submenu = make('div', 'qd-submenu')
    const gridOption = make('button', 'qd-menu-item')
    gridOption.appendChild(make('span', 'qd-mi-label', 'Dots'))
    gridOption.addEventListener('click', event => { event.stopPropagation(); nativeActions.push('Dots') })
    submenu.appendChild(gridOption)
    grid.appendChild(submenu)
    item('Theme', { close: false, className: 'qd-menu-row' })
    ui.appendChild(popover)
    menuButton.classList.add('on')
  })
  root.addEventListener('pointerdown', event => {
    if (!ui.contains(event.target)) closeNative()
  }, true)
  return {
    document, window, root, ui, dock, header, controls, tools, menuButton, nativeActions, shortcuts,
    board: { editor: { container: root } },
    setSelection(value) { selection = value }
  }
}

const menuOf = environment => environment.root.querySelector('.qd-menu-pop')
const labelOf = row => row.querySelector('.qd-mi-label')?.textContent
const rowNamed = (menu, label) => menu.querySelectorAll('.qd-mi-label').find(node => node.textContent === label)?.parentNode
const actionNames = ['read', 'save', 'fullscreen', 'png', 'fit']

test('selector is directly left of the native menu and existing tools and options survive', () => {
  const environment = fixture()
  const { controls, dock, tools, menuButton } = environment
  const originalChildren = [...dock.children]
  const option = controls.selector.firstChild
  const result = mountViewerChrome(environment.board, controls)
  assert.deepEqual(Object.keys(result).sort(), ['closeMenu', 'menuButton'])
  assert.equal(result.menuButton, menuButton)
  assert.equal(controls.selector.parentNode, dock)
  assert.equal(controls.selector.nextElementSibling, menuButton)
  assert.equal(menuButton.previousElementSibling, controls.selector)
  assert.deepEqual(dock.children.filter(child => child !== controls.selector), originalChildren)
  assert.deepEqual(dock.querySelectorAll('button'), [...tools, menuButton])
  assert.equal(controls.selector.firstChild, option)
  assert.equal(option.textContent, 'Current board')
  assert.equal(controls.selector.value, 'board-1')
  assert.equal(controls.selector.hidden, false)
  assert.equal(controls.selector.style.display, '')
  assert.equal(controls.input.parentNode, environment.header)
  assert.equal(controls.input.hidden, true)
})

test('selector pointer and click events do not reach editor handlers or prevent select defaults', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  const reached = []
  for (const type of ['pointerdown', 'click']) environment.root.addEventListener(type, () => reached.push(type))
  for (const type of ['pointerdown', 'click']) {
    const event = new DOMEvent(type)
    assert.equal(environment.controls.selector.dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  }
  assert.deepEqual(reached, [])
})

test('selector keys bypass capture and bubble shortcuts but Escape reaches the parent capture handler', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  const parentKeys = []
  environment.window.addEventListener('keydown', event => parentKeys.push(event.key), true)
  for (const key of ['ArrowDown', 's', 'Escape']) {
    const event = new DOMEvent('keydown', { key, ctrlKey: key === 's' })
    assert.equal(environment.controls.selector.dispatchEvent(event), true)
  }
  assert.deepEqual(parentKeys, ['ArrowDown', 's', 'Escape'])
  assert.deepEqual(environment.shortcuts, ['capture:Escape', 'bubble:Escape'])
  environment.root.dispatchEvent(new DOMEvent('keydown', { key: 'v' }))
  assert.deepEqual(environment.shortcuts.slice(-2), ['capture:v', 'bubble:v'])
})

test('scrolling the menu keeps native scrolling available without panning the canvas', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  let cameraX = 0
  environment.root.addEventListener('wheel', event => { cameraX += 10; event.preventDefault() })
  environment.menuButton.click()
  const event = new DOMEvent('wheel')
  assert.equal(menuOf(environment).dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.equal(cameraX, 0)
})

test('menu keyboard activation does not reach editor shortcut handlers or suppress button defaults', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  environment.menuButton.click()
  for (const key of ['Enter', ' ', 't']) {
    const event = new DOMEvent('keydown', { key })
    assert.equal(environment.controls.read.dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  }
  assert.deepEqual(environment.shortcuts, [])
})

test('menu is decorated synchronously with ordered host actions and primary export and fit replacements', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  environment.menuButton.click()
  const menu = menuOf(environment)
  const { controls } = environment
  assert.ok(menu)
  assert.deepEqual(menu.children.slice(0, 3), [controls.read, controls.save, controls.fullscreen])
  assert.equal(menu.children[3].className, 'qd-menu-div')
  assert.equal(menu.children[4], controls.png)
  assert.equal(rowNamed(menu, 'Export as PNG'), undefined)
  assert.equal(rowNamed(menu, 'Zoom to fit'), undefined)
  assert.equal(menu.children.findIndex(row => row === controls.fit) + 1, menu.children.findIndex(row => labelOf(row) === 'Clear board'))
  for (const name of actionNames) {
    const control = controls[name]
    assert.equal(control.id, `viewer-${name}`)
    assert.equal(control.hidden, false)
    assert.equal(control.style.display, '')
    assert.ok(control.classList.contains('qd-menu-item'))
    assert.ok(control.querySelector('.qd-mi-label'))
    assert.equal(control.querySelector('svg').namespaceURI, 'http://www.w3.org/2000/svg')
    assert.ok(control.querySelector('path').getAttribute('d'))
  }
})

test('native transparent, copy, clear, nested grid and theme rows retain their behavior', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  for (const [visible, original, closes] of [
    ['匯出普通 PNG（透明）', 'Export — transparent', true],
    ['複製圖片（不可編輯）', 'Copy as image', true],
    ['Clear board', 'Clear board', true],
    ['Grid', 'Grid', false],
    ['Dots', 'Dots', false],
    ['Theme', 'Theme', false]
  ]) {
    if (!menuOf(environment)) environment.menuButton.click()
    const row = rowNamed(menuOf(environment), visible)
    assert.ok(row, visible)
    row.click()
    assert.equal(environment.nativeActions.at(-1), original)
    assert.equal(Boolean(menuOf(environment)), !closes)
  }
})

test('selection rows are regenerated by the SDK without losing or duplicating host actions', () => {
  const environment = fixture()
  const chrome = mountViewerChrome(environment.board, environment.controls)
  for (const selected of [false, true, false, true]) {
    environment.setSelection(selected)
    environment.menuButton.click()
    const menu = menuOf(environment)
    assert.equal(Boolean(rowNamed(menu, 'Delete selection')), selected)
    assert.equal(Boolean(rowNamed(menu, '匯出選取 PNG（不可編輯）')), selected)
    assert.ok(rowNamed(menu, selected ? '複製選取圖片（不可編輯）' : '複製圖片（不可編輯）'))
    for (const name of actionNames) assert.equal(menu.querySelectorAll('button').filter(row => row === environment.controls[name]).length, 1)
    chrome.closeMenu()
    assert.equal(menuOf(environment), null)
  }
  environment.menuButton.click()
  rowNamed(menuOf(environment), '匯出選取 PNG（不可編輯）').click()
  assert.equal(environment.nativeActions.at(-1), 'Export selection')
})

test('each action closes before later host listeners while keeping synchronous user activation', () => {
  const environment = fixture()
  mountViewerChrome(environment.board, environment.controls)
  const actions = []
  const canvasClicks = []
  environment.root.addEventListener('click', () => canvasClicks.push('click'))
  for (const name of actionNames) {
    environment.controls[name].addEventListener('click', event => {
      actions.push(name)
      assert.equal(menuOf(environment), null)
      assert.equal(environment.menuButton.classList.contains('on'), false)
      assert.equal(environment.document.userActivation.active, true)
      assert.equal(event.defaultPrevented, false)
    })
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const name of actionNames) {
      environment.menuButton.click()
      environment.controls[name].querySelector('.qd-mi-label').click()
    }
  }
  assert.deepEqual(actions, Array.from({ length: 3 }, () => actionNames).flat())
  assert.deepEqual(canvasClicks, [])
  assert.deepEqual(environment.nativeActions, [])
})

test('closeMenu is a no-op when closed and native toggle state remains synchronized', () => {
  const environment = fixture()
  const chrome = mountViewerChrome(environment.board, environment.controls)
  chrome.closeMenu()
  assert.equal(menuOf(environment), null)
  environment.menuButton.click()
  assert.ok(menuOf(environment))
  environment.menuButton.click()
  assert.equal(menuOf(environment), null)
  environment.menuButton.click()
  chrome.closeMenu()
  assert.equal(menuOf(environment), null)
  assert.equal(environment.menuButton.classList.contains('on'), false)
  chrome.closeMenu()
  environment.menuButton.click()
  assert.ok(menuOf(environment))
  assert.equal(menuOf(environment).children[0], environment.controls.read)
  environment.root.dispatchEvent(new DOMEvent('pointerdown'))
  chrome.closeMenu()
  assert.equal(menuOf(environment), null)
  environment.menuButton.click()
  assert.ok(menuOf(environment))
})

test('disabled actions retain their state and existing listeners and can later be enabled', () => {
  const environment = fixture()
  const { save } = environment.controls
  save.disabled = true
  let saved = 0
  save.addEventListener('click', () => { saved++ })
  const chrome = mountViewerChrome(environment.board, environment.controls)
  for (let cycle = 0; cycle < 3; cycle++) {
    environment.menuButton.click()
    assert.equal(save.disabled, true)
    save.click()
    assert.equal(saved, 0)
    assert.ok(menuOf(environment))
    chrome.closeMenu()
  }
  save.disabled = false
  environment.menuButton.click()
  save.click()
  assert.equal(saved, 1)
  assert.equal(menuOf(environment), null)
})

test('user labels, option labels and titles remain literal text without HTML injection', () => {
  const environment = fixture()
  const label = '<img src=x onerror="throw 1"> & Board'
  environment.controls.selector.firstChild.textContent = label
  environment.controls.read.textContent = label
  environment.controls.read.title = '<script>throw 2</script>'
  environment.controls.save.textContent = ''
  environment.controls.save.title = '<img src=x onerror="throw 3">'
  mountViewerChrome(environment.board, environment.controls)
  environment.menuButton.click()
  assert.equal(labelOf(environment.controls.read), label)
  assert.equal(environment.controls.read.title, '<script>throw 2</script>')
  assert.equal(labelOf(environment.controls.save), '<img src=x onerror="throw 3">')
  assert.equal(environment.controls.selector.firstChild.textContent, label)
  assert.equal(environment.document.querySelectorAll('img').length, 0)
  assert.equal(environment.document.querySelectorAll('script').length, 0)
})

test('missing board root, native UI, dock or menu button fails descriptively', () => {
  assert.throws(() => mountViewerChrome({}, {}), /board\.editor\.container/)
  for (const [omit, message] of [['ui', /\.qd-ui/], ['dock', /\.qd-dock/], ['menu', /button\[data-name="menu"\]/]]) {
    const environment = fixture({ omit })
    assert.throws(() => mountViewerChrome(environment.board, environment.controls), message)
    assert.equal(environment.controls.selector.parentNode, environment.header)
  }
})

test('a menu button outside its dock and incompatible native menu rows fail descriptively', () => {
  const environment = fixture()
  environment.ui.appendChild(environment.menuButton)
  assert.throws(() => mountViewerChrome(environment.board, environment.controls), /menu|dock/)
  const incompatible = fixture({ incompatibleMenu: true })
  mountViewerChrome(incompatible.board, incompatible.controls)
  assert.throws(() => incompatible.menuButton.click(), /Export as PNG/)
})
