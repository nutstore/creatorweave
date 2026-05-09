// 跳转到文件对话框
export const goToFile = {
    placeholder: "搜索文件路径...",
    scanning: "正在扫描文件...",
    noMatch: "没有匹配的文件",
    typeToSearch: "输入关键词搜索文件",
    footer: {
      select: "↑↓ 选择",
      open: "Enter 打开",
      close: "Esc 关闭",
      total: "共 {count} 个文件",
      truncated: "共 {count} 个文件，显示前 100",
    },
} as const
