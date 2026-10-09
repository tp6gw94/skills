export function mountViewerChrome(board, controls) {
  const root = board?.editor?.container
  if (!root || typeof root.querySelector !== 'function') {
    throw new Error('Viewer chrome requires board.editor.container to be a DOM element')
  }
  const ui = root.querySelector('.qd-ui')
  if (!ui) throw new Error('Viewer chrome requires the native .qd-ui element')
  const dock = ui.querySelector('.qd-dock')
  if (!dock) throw new Error('Viewer chrome requires the native .qd-dock element')
  const menuButton = dock.querySelector('button[data-name="menu"]')
  if (!menuButton || menuButton.parentElement !== dock) {
    throw new Error('Viewer chrome requires native button[data-name="menu"] directly inside .qd-dock')
  }
  const actionNames = ['read', 'save', 'fullscreen', 'png', 'fit']
  for (const name of ['selector', ...actionNames]) {
    if (!controls?.[name] || typeof controls[name].addEventListener !== 'function') {
      throw new Error(`Viewer chrome requires controls.${name} to be a DOM element`)
    }
  }
  const document = root.ownerDocument
  const selector = controls.selector
  const stop = event => event.stopPropagation()
  const reveal = element => {
    element.hidden = false
    if (element.style.display === 'none') element.style.removeProperty('display')
  }
  const closeMenu = () => {
    if (ui.querySelector('.qd-menu-pop')) menuButton.click()
  }
  const make = (tag, className) => {
    const element = document.createElement(tag)
    element.className = className
    return element
  }
  const paths = {
    read: 'M3 7h6l2 2h10l-3 11H3Z M3 7V4h7l2 3',
    save: 'M4 3h13l4 4v14H3V3Z M7 3v6h10V3 M7 21v-8h10v8',
    fullscreen: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
    png: 'M12 3v12 M7 10l5 5 5-5 M3 16v5h18v-5',
    fit: 'M3 8V3h5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8Z'
  }
  const defaults = {
    read: 'Read board',
    save: 'Save board',
    fullscreen: 'Fullscreen',
    png: 'Export editable PNG',
    fit: 'Zoom to fit'
  }
  for (const name of actionNames) {
    const action = controls[name]
    const text = action.textContent || action.title || defaults[name]
    const icon = make('span', 'qd-mi-ico')
    icon.setAttribute('aria-hidden', 'true')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [attribute, value] of Object.entries({
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    })) svg.setAttribute(attribute, value)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', paths[name])
    svg.appendChild(path)
    icon.appendChild(svg)
    const label = make('span', 'qd-mi-label')
    label.textContent = text
    action.textContent = ''
    action.appendChild(icon)
    action.appendChild(label)
    action.classList.add('qd-menu-item')
    action.type = 'button'
    action.remove()
    reveal(action)
    action.addEventListener('pointerdown', stop)
    action.addEventListener('click', event => {
      event.stopPropagation()
      closeMenu()
    })
  }
  dock.insertBefore(selector, menuButton)
  reveal(selector)
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click']) {
    selector.addEventListener(type, stop)
  }
  document.addEventListener('keydown', event => {
    const menu = ui.querySelector('.qd-menu-pop')
    if (event.key !== 'Escape' && (selector.contains(event.target) || menu?.contains(event.target))) event.stopPropagation()
  }, true)
  const decorated = new WeakSet()
  menuButton.addEventListener('click', () => {
    const menu = ui.querySelector('.qd-menu-pop')
    if (!menu || decorated.has(menu)) return
    menu.addEventListener('wheel', stop, { passive: true })
    const rows = Array.from(menu.children).filter(row => row.classList.contains('qd-menu-item'))
    const findRow = text => rows.find(row => row.querySelector('.qd-mi-label')?.textContent === text)
    const primary = findRow('Export as PNG')
    const fit = findRow('Zoom to fit')
    if (!primary || !fit) {
      throw new Error('Viewer chrome requires native menu rows "Export as PNG" and "Zoom to fit"')
    }
    menu.replaceChild(controls.png, primary)
    menu.replaceChild(controls.fit, fit)
    const rasterLabels = new Map([
      ['Export — transparent', '匯出普通 PNG（透明）'],
      ['Export selection', '匯出選取 PNG（不可編輯）'],
      ['Copy as image', '複製圖片（不可編輯）'],
      ['Copy selection as image', '複製選取圖片（不可編輯）']
    ])
    for (const row of rows) {
      const label = row.querySelector('.qd-mi-label')
      const text = rasterLabels.get(label?.textContent)
      if (text) label.textContent = text
    }
    const first = menu.firstChild
    for (const name of ['read', 'save', 'fullscreen']) menu.insertBefore(controls[name], first)
    menu.insertBefore(make('i', 'qd-menu-div'), first)
    decorated.add(menu)
  })
  return { menuButton, closeMenu }
}
