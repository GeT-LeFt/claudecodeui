"""
CloudCLI E2E 测试 v3：验证消息不重复 + 系统标签不显示
"""
import time
from playwright.sync_api import sync_playwright

URL = "http://localhost:3001/"
USERNAME = "thelastbattle1"
PASSWORD = "Hcx@19960830"

def wait_for_projects_loaded(page, timeout=30):
    """等待项目列表加载完成"""
    for i in range(timeout):
        loading = page.query_selector('text=Loading projects')
        loading2 = page.query_selector('text=Loading CloudCLI')
        if not loading and not loading2:
            return True
        page.wait_for_timeout(1000)
        if i % 5 == 4:
            print(f"    ... 项目加载中 ({i+1}s)")
    return False

def wait_for_chat_loaded(page, timeout=15):
    """等待聊天消息加载完成"""
    for i in range(timeout):
        loading = page.query_selector('text=Loading messages')
        if not loading:
            # 确认有聊天消息或输入框
            msgs = page.query_selector_all('.chat-message')
            textarea = page.query_selector('textarea')
            if msgs or textarea:
                return True
        page.wait_for_timeout(1000)
    return False

def test_cloudcli():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(URL, wait_until="networkidle")
        time.sleep(2)

        # === Step 1: 登录 ===
        print("[1] 检查登录状态...")
        token = page.evaluate("localStorage.getItem('auth-token')")
        if not token:
            print("    需要登录...")
            inputs = page.query_selector_all('input')
            if len(inputs) >= 2:
                inputs[0].fill(USERNAME)
                inputs[1].fill(PASSWORD)
            page.click('button[type="submit"]')
            page.wait_for_timeout(3000)
            token = page.evaluate("localStorage.getItem('auth-token')")
            if not token:
                print("    ❌ 登录失败")
                browser.close()
                return False
            print("    ✅ 登录成功")
        else:
            print("    ✅ 已登录")

        # === Step 2: 等待项目加载完成 ===
        print("[2] 等待项目加载...")
        if wait_for_projects_loaded(page, 30):
            print("    ✅ 项目加载完成")
        else:
            print("    ⚠️ 项目加载超时，继续尝试...")

        page.wait_for_timeout(2000)
        page.screenshot(path="/tmp/cloudcli-loaded.png")

        # === Step 3: 找项目并展开，进入会话 ===
        print("[3] 寻找项目和会话...")

        # 先检查是否有直接的会话链接
        session_links = page.query_selector_all('a[href*="/session/"]')
        if session_links:
            print(f"    找到 {len(session_links)} 个会话链接，点击第一个...")
            session_links[0].click()
            page.wait_for_timeout(3000)
        else:
            # 需要先展开项目
            # 找项目名称元素（通常是可点击的div/button）
            project_found = page.evaluate("""
                () => {
                    // 查找包含项目信息的可点击元素
                    const els = document.querySelectorAll('[class*="project"], [class*="group"], [class*="item"]');
                    for (const el of els) {
                        const text = el.textContent || '';
                        // 排除底部链接
                        if (text.includes('Report') || text.includes('Settings') || text.includes('Community')) continue;
                        // 找包含路径的元素（项目名通常包含路径）
                        if (el.offsetParent !== null && el.offsetHeight > 20) {
                            const clickTarget = el.querySelector('button') || el.querySelector('[role="button"]') || el;
                            clickTarget.click();
                            return text.trim().substring(0, 60);
                        }
                    }
                    // 尝试找侧边栏中的所有按钮
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.textContent?.trim() || '';
                        if (text && !text.includes('Setting') && !text.includes('Report') &&
                            !text.includes('Community') && !text.includes('Star') &&
                            text.length > 3 && text.length < 80 && btn.offsetParent !== null) {
                            btn.click();
                            return 'btn: ' + text.substring(0, 60);
                        }
                    }
                    return null;
                }
            """)
            print(f"    点击项目: {project_found}")
            page.wait_for_timeout(2000)

            # 等会话链接出现
            for _ in range(5):
                session_links = page.query_selector_all('a[href*="/session/"]')
                if session_links:
                    break
                page.wait_for_timeout(1000)

            if session_links:
                print(f"    找到 {len(session_links)} 个会话，点击第一个...")
                session_links[0].click()
                page.wait_for_timeout(3000)
            else:
                print("    ⚠️ 未找到会话链接")
                page.screenshot(path="/tmp/cloudcli-no-sessions.png")
                # 尝试直接导航到已知会话
                page.goto(URL + "session/b3e5425f-1986-40f9-b81c-922b6e0ce87e", wait_until="networkidle")
                page.wait_for_timeout(5000)

        # 等待聊天加载
        wait_for_chat_loaded(page, 10)
        page.wait_for_timeout(2000)
        page.screenshot(path="/tmp/cloudcli-chat.png")

        # === Step 4: 检查聊天消息 ===
        print("[4] 检查聊天消息...")
        body_text = page.inner_text('body')

        results = []

        # 4a: 系统消息过滤检查
        checks = {
            "Continue from where you left off": "Continue 续接消息",
            "<local-command-caveat>": "local-command-caveat 标签",
            "<system-reminder>": "system-reminder 标签",
        }
        for pattern, label in checks.items():
            found = pattern in body_text
            status = "❌" if found else "✅"
            print(f"    {status} '{label}' {'显示在页面中' if found else '已被正确过滤'}")
            results.append(f"{'FAIL' if found else 'PASS'}: {label}")

        # 4b: 检查用户消息是否有相邻重复
        user_bubbles = page.query_selector_all('.chat-message.user')
        print(f"    用户消息气泡数量: {len(user_bubbles)}")

        if len(user_bubbles) >= 2:
            dup_count = 0
            for i in range(len(user_bubbles) - 1):
                text_a = user_bubbles[i].inner_text().strip()
                text_b = user_bubbles[i + 1].inner_text().strip()
                # 去掉最后一行（时间戳）
                lines_a = text_a.split('\n')
                lines_b = text_b.split('\n')
                core_a = '\n'.join(lines_a[:-1]).strip() if len(lines_a) > 1 else text_a
                core_b = '\n'.join(lines_b[:-1]).strip() if len(lines_b) > 1 else text_b
                if core_a == core_b and len(core_a) > 2:
                    dup_count += 1
                    print(f"    ❌ 重复消息: '{core_a[:50]}'")
            if dup_count == 0:
                print("    ✅ 历史消息无相邻重复")
                results.append("PASS: no duplicates in history")
            else:
                results.append(f"FAIL: {dup_count} duplicate(s) in history")
        else:
            print("    (消息不足，跳过重复检查)")

        # === Step 5: 发送新消息并验证 ===
        print("[5] 发送测试消息...")
        textarea = page.query_selector('textarea')
        if textarea:
            test_msg = f"e2e_test_{int(time.time())}"
            textarea.fill(test_msg)
            page.wait_for_timeout(500)

            # 提交
            submit = page.query_selector('button[type="submit"]')
            if submit and submit.is_enabled():
                submit.click()
            else:
                textarea.press('Enter')

            page.wait_for_timeout(5000)

            # 检查新消息重复
            user_msgs = page.query_selector_all('.chat-message.user')
            count = sum(1 for m in user_msgs if test_msg in m.inner_text())

            if count == 1:
                print(f"    ✅ 新消息只出现 1 次")
                results.append("PASS: new message not duplicated")
            elif count > 1:
                print(f"    ❌ 新消息出现 {count} 次！")
                results.append(f"FAIL: new message duplicated ({count}x)")
            else:
                page.wait_for_timeout(3000)
                user_msgs = page.query_selector_all('.chat-message.user')
                count = sum(1 for m in user_msgs if test_msg in m.inner_text())
                if count == 1:
                    print(f"    ✅ 新消息出现 1 次")
                    results.append("PASS: new message not duplicated")
                else:
                    print(f"    ⚠️ 新消息出现 {count} 次")
                    results.append(f"WARN: new message count={count}")

            # 等待 AI 回复
            print("[6] 等待 AI 回复...")
            ai_replied = False
            for i in range(45):
                page.wait_for_timeout(1000)
                a_msgs = page.query_selector_all('.chat-message.assistant')
                if a_msgs:
                    last_text = a_msgs[-1].inner_text().strip()
                    if last_text and len(last_text) > 10 and '思考中' not in last_text and 'Processing' not in last_text:
                        print(f"    ✅ AI 回复了 ({i+1}s): {last_text[:80]}...")
                        ai_replied = True
                        results.append("PASS: AI responded")
                        break
                if i % 10 == 9:
                    print(f"    ... 等待中 ({i+1}s)")

            if not ai_replied:
                print("    ⚠️ 45s 内未收到 AI 回复")
                results.append("WARN: no AI response in 45s")

            # 回复后再次检查新消息是否重复
            page.wait_for_timeout(2000)
            user_msgs = page.query_selector_all('.chat-message.user')
            final_count = sum(1 for m in user_msgs if test_msg in m.inner_text())
            if final_count > 1:
                print(f"    ❌ AI 回复后新消息变成了 {final_count} 条！")
                results.append(f"FAIL: post-reply duplicate ({final_count}x)")
            elif final_count == 1:
                print(f"    ✅ AI 回复后新消息仍为 1 条")
        else:
            print("    ⚠️ 未找到 textarea 输入框")
            results.append("WARN: no textarea")
            page.screenshot(path="/tmp/cloudcli-no-textarea.png")

        page.screenshot(path="/tmp/cloudcli-final.png")

        # === 总结 ===
        print("\n" + "=" * 50)
        print("E2E 测试结果:")
        fails = 0
        for r in results:
            if r.startswith("PASS"):
                print(f"  ✅ {r}")
            elif r.startswith("FAIL"):
                print(f"  ❌ {r}")
                fails += 1
            else:
                print(f"  ⚠️ {r}")

        verdict = "全部通过!" if fails == 0 else f"{fails} 项失败"
        print(f"\n{'✅' if fails == 0 else '❌'} {verdict}")
        print("=" * 50)
        browser.close()
        return fails == 0

if __name__ == "__main__":
    test_cloudcli()
