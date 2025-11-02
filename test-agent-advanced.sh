#!/bin/bash

# 高级 Agent API 测试脚本
# 测试幂等性、冲突处理、错误码映射等

set -e

PROJECT_ROOT="${1:-/Users/fankex/Developer/webgal_agent/WebGAL_Terre/packages/terre2/assets/templates/WebGAL_Template}"
API_BASE="http://localhost:3001/api/agent"

echo "=== Agent API 高级测试 ==="
echo "项目根: $PROJECT_ROOT"
echo "API 地址: $API_BASE"
echo ""

# 1. 启动 MCP
echo "1. 启动 MCP..."
curl -s -X POST "$API_BASE/start" \
  -H "Content-Type: application/json" \
  -d "{\"projectRoot\":\"$PROJECT_ROOT\",\"enableExec\":false}" | jq .
echo ""

# 2. 测试幂等性 - 第一次写入
echo "2. 测试幂等性 - 第一次写入（apply）..."
IDEMPOTENCY_KEY="test-$(date +%s)"
RESPONSE1=$(curl -s -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"write_to_file\",
    \"args\": {
      \"path\": \"game/scene/idempotency_test.txt\",
      \"content\": \"; 幂等性测试\\n你好，世界！;\",
      \"dryRun\": false,
      \"idempotencyKey\": \"$IDEMPOTENCY_KEY\"
    }
  }")
echo "$RESPONSE1" | jq .
echo ""

# 3. 测试幂等性 - 第二次写入（应该返回冲突）
echo "3. 测试幂等性 - 第二次写入（应该返回 409 冲突）..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"write_to_file\",
    \"args\": {
      \"path\": \"game/scene/idempotency_test.txt\",
      \"content\": \"; 幂等性测试\\n你好，世界！;\",
      \"dryRun\": false,
      \"idempotencyKey\": \"$IDEMPOTENCY_KEY\"
    }
  }")
echo "HTTP 状态码: $HTTP_CODE"
cat /tmp/response.json | jq .
echo ""

# 4. 测试错误码 - 文件不存在（E_NOT_FOUND → 404）
echo "4. 测试错误码 - 读取不存在的文件（应该返回 404）..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"read_file\",
    \"args\": {
      \"path\": \"game/scene/nonexistent.txt\"
    }
  }")
echo "HTTP 状态码: $HTTP_CODE"
cat /tmp/response.json | jq .
echo ""

# 5. 测试错误码 - 参数错误（E_BAD_ARGS → 400）
echo "5. 测试错误码 - 缺少必需参数（应该返回 400）..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/response.json -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"write_to_file\",
    \"args\": {
      \"path\": \"game/scene/test.txt\"
    }
  }")
echo "HTTP 状态码: $HTTP_CODE"
cat /tmp/response.json | jq .
echo ""

# 6. 测试 Dry-run → Apply 流程
echo "6. 测试 Dry-run → Apply 流程..."
echo "6a. Dry-run 预览..."
curl -s -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"write_to_file\",
    \"args\": {
      \"path\": \"game/scene/workflow_test.txt\",
      \"content\": \"; 工作流测试\\nsetVar:name=测试; // 设置变量\\n\",
      \"dryRun\": true
    }
  }" | jq .
echo ""

echo "6b. Apply 实际写入..."
curl -s -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"write_to_file\",
    \"args\": {
      \"path\": \"game/scene/workflow_test.txt\",
      \"content\": \"; 工作流测试\\nsetVar:name=测试; // 设置变量\\n\",
      \"dryRun\": false
    }
  }" | jq .
echo ""

# 7. 测试脚本校验
echo "7. 测试脚本校验..."
curl -s -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"validate_script\",
    \"args\": {
      \"path\": \"game/scene/workflow_test.txt\"
    }
  }" | jq .
echo ""

# 8. 测试资源列表
echo "8. 测试资源列表..."
curl -s -X POST "$API_BASE/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"list_project_resources\",
    \"args\": {}
  }" | jq .
echo ""

# 9. 停止 MCP
echo "9. 停止 MCP..."
curl -s -X POST "$API_BASE/stop" | jq .
echo ""

echo "=== 高级测试完成 ==="

