EO2Weave Native Host (macOS) — 安装说明
======================================

这个包让你的浏览器扩展（EO2Weave）访问本机文件、执行命令，
并向 Codex / Claude Code 等 MCP 客户端暴露网页 WebMCP 工具。

安装
----

双击 EO2Weave-Host-Setup-*.pkg，按提示输入管理员密码。

安装位置（系统级，对所有用户生效，不受下载目录清理影响）：

  /Library/Application Support/EO2Weave NativeHost/NativeMessagingHosts/cw-native-host
  /Library/Google/Chrome/NativeMessagingHosts/com.creatorweave.nativehost.json
  /Library/Application Support/Microsoft/Edge/NativeMessagingHosts/…（Edge）

然后完全退出并重启浏览器（Chrome: Cmd+Q，不是只关窗口）。

验证
----

chrome://native-internals 应列出 com.creatorweave.nativehost。

配合 Codex / Claude Code 等 MCP 客户端使用
-----------------------------------------

1. 浏览器扩展 popup → 打开「Agent 桥接（MCP）」开关
2. 运行（或复制 popup 里的命令）：

   codex mcp add eo2weave-webmcp -- '/Library/Application Support/EO2Weave NativeHost/NativeMessagingHosts/cw-native-host' --mcp-stdio
   claude mcp add eo2weave-webmcp -- '/Library/Application Support/EO2Weave NativeHost/NativeMessagingHosts/cw-native-host' --mcp-stdio

3. 打开提供 WebMCP 工具的网页，MCP 客户端即可 tools/list
   看到并调用这些工具。

命令行安装（无 GUI 环境）
------------------------

sudo installer -pkg EO2Weave-Host-Setup-*.pkg -target /

卸载
----

sudo bash '/Library/Application Support/EO2Weave NativeHost/uninstall.sh'
