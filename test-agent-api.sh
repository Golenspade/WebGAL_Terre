#!/bin/bash

# Agent API 快速自测脚本
# 使用方法：./test-agent-api.sh <project-root>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <project-root>"
  echo "Example: $0 /path/to/webgal/game"
  exit 1
fi

PROJECT_ROOT="$1"
BASE_URL="http://localhost:3001/api/agent"

echo "=== Agent API 自测 ==="
echo "项目根: $PROJECT_ROOT"
echo "API 地址: $BASE_URL"
echo ""

# 1. 启动 MCP
echo "1. 启动 MCP..."
curl -X POST "$BASE_URL/start" \
  -H "Content-Type: application/json" \
  -d "{\"projectRoot\":\"$PROJECT_ROOT\",\"enableExec\":false,\"enableBrowser\":false}" \
  | jq .
echo ""

# 等待启动
sleep 2

# 2. 获取状态
echo "2. 获取状态..."
curl -X GET "$BASE_URL/status" | jq .
echo ""

# 3. 列出工具
echo "3. 列出工具..."
curl -X GET "$BASE_URL/tools" | jq .
echo ""

# 4. 调用 list_files
echo "4. 调用 list_files (game/scene)..."
curl -X POST "$BASE_URL/call" \
  -H "Content-Type: application/json" \
  -d '{"name":"list_files","args":{"path":"game/scene"}}' \
  | jq .
echo ""

# 5. 调用 validate_script
echo "5. 调用 validate_script (game/scene/start.txt)..."
curl -X POST "$BASE_URL/call" \
  -H "Content-Type: application/json" \
  -d '{"name":"validate_script","args":{"path":"game/scene/start.txt"}}' \
  | jq .
echo ""

# 6. 调用 write_to_file (dry-run)
echo "6. 调用 write_to_file (dry-run)..."
curl -X POST "$BASE_URL/call" \
  -H "Content-Type: application/json" \
  -d '{"name":"write_to_file","args":{"path":"game/scene/test.txt","content":"; 测试场景\n你好，世界！;","dryRun":true}}' \
  | jq .
echo ""

# 7. 停止 MCP
echo "7. 停止 MCP..."
curl -X POST "$BASE_URL/stop" | jq .
echo ""

echo "=== 测试完成 ==="

