export function validLanguage(value) {
  return ['system', 'en', 'zh-CN'].includes(value);
}
export function menuTemplate(preference, systemLanguages) {
  const chinese =
    preference === 'zh-CN' ||
    (preference === 'system' && /^zh(?:-|$)/i.test(systemLanguages[0] || ''));
  const label = (en, zh) => (chinese ? zh : en);
  return [
    {
      label: 'Kites',
      submenu: [
        { role: 'about', label: label('About Kites', '关于 Kites') },
        { type: 'separator' },
        { role: 'hide', label: label('Hide Kites', '隐藏 Kites') },
        { role: 'quit', label: label('Quit Kites', '退出 Kites') },
      ],
    },
    {
      label: label('Edit', '编辑'),
      submenu: [
        { role: 'undo', label: label('Undo', '撤销') },
        { role: 'redo', label: label('Redo', '重做') },
        { type: 'separator' },
        { role: 'cut', label: label('Cut', '剪切') },
        { role: 'copy', label: label('Copy', '复制') },
        { role: 'paste', label: label('Paste', '粘贴') },
        { role: 'selectAll', label: label('Select All', '全选') },
      ],
    },
    {
      label: label('View', '视图'),
      submenu: [
        { role: 'reload', label: label('Reload', '重新加载') },
        { role: 'toggleDevTools', label: label('Developer Tools', '开发者工具') },
        { type: 'separator' },
        { role: 'resetZoom', label: label('Actual Size', '实际大小') },
        { role: 'zoomIn', label: label('Zoom In', '放大') },
        { role: 'zoomOut', label: label('Zoom Out', '缩小') },
        { role: 'togglefullscreen', label: label('Toggle Full Screen', '切换全屏') },
      ],
    },
    {
      label: label('Window', '窗口'),
      submenu: [
        { role: 'minimize', label: label('Minimize', '最小化') },
        { role: 'close', label: label('Close', '关闭') },
      ],
    },
  ];
}
