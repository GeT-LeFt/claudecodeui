#!/bin/bash
# CloudCLI 健康检查 & 自动重启脚本

WORKDIR="/Users/admin/Desktop/claudecodeui"
LOG="/tmp/cloudcli-healthcheck.log"

if pgrep -f 'node server/cli.js' | grep -v grep > /dev/null 2>&1; then
  exit 0
fi

echo "[$(date)] CloudCLI 未运行，正在重启..." >> "$LOG"
cd "$WORKDIR" || exit 1
env -u CLAUDECODE nohup node server/cli.js >> /tmp/cloudcli-server.log 2>&1 &
sleep 3

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ | grep -q 200; then
  echo "[$(date)] 重启成功" >> "$LOG"
else
  echo "[$(date)] 重启失败！" >> "$LOG"
fi
