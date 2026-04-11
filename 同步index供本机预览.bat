@echo off
chcp 65001 >nul
cd /d "%~dp0"
copy /Y "特价机票发现平台.html" "index.html"
echo 已生成 index.html（与特价机票发现平台.html 内容一致）
echo 可用 npx serve . 或任意静态服务器打开目录预览
pause
