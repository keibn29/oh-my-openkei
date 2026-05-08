# Hướng dẫn slide cài đặt & sử dụng oh-my-openkei (non-tech)

## Step 1 — Cài Bun

**Command/action**

- macOS/Linux: `curl -fsSL https://bun.sh/install | bash`
- Windows (PowerShell): `powershell -c "irm bun.sh/install.ps1|iex"`

**Success**

- Chạy `bun --version` và thấy số version.

**If fail**

- Kiểm tra mạng.
- Đóng/mở lại terminal rồi chạy lại lệnh kiểm tra.

---

## Step 2 — Cài OpenCode

**Command/action**

- `bun install -g opencode-ai`

**Success**

- Chạy `opencode --version` và thấy số version.

**If fail**

- Quay lại Step 1.
- Mở lại terminal rồi chạy lại.

---

## Step 3 — Cài plugin

**Command/action**

- `bunx oh-my-openkei@latest install`

**Success**

- Lệnh chạy xong, không có lỗi đỏ.

**If fail**

- Kiểm tra chính tả lệnh.
- Quay lại Step 1–2.

---

## Step 4 — Đăng nhập AI provider

**Command/action**

- `opencode auth login`

**Success**

- Terminal/trình duyệt báo đăng nhập thành công.

**If fail**

- Kiểm tra mạng và tài khoản AI.
- Chạy lại lệnh.

---

## Step 5 — Auth Atlassian MCP

**Command/action**

- `opencode mcp auth atlassian`

**Success**

- Trình duyệt mở ra, login xong, terminal báo hoàn tất.

**If fail**

- Kiểm tra mạng.
- Kiểm tra tài khoản Atlassian.
- Chạy lại lệnh.

---

## Step 6 — Cài VS Code extension OpenKei

**Command/action**

- Mở VS Code → Extensions.
- Tìm `OpenKei`.
- Cài extension `kei29.openkei`.

**Success**

- Extension hiện trạng thái **Installed**.

**If fail**

- Kiểm tra đúng ID extension: `kei29.openkei`.
- Kiểm tra mạng và cài lại.

---

## Step 7 — Sửa config trong OpenKei

**Command/action**

- Mở settings của extension OpenKei trên VS Code.
- Chọn **Plugin**.
- Chọn **oh-my-openkei**.
- Sửa file config → **Save**.
- Trong VSCode: ấn tổ hợp phím `ctrl/cmd + shift + p`
- Gõ chữ `Reload Window` -> **Enter**.

**Success**

- Save được file config.
- Reload xong, không báo lỗi config.

**If fail**

- Kiểm tra cú pháp JSON/JSONC.
- Save lại và reload lại VS Code.

---

## Step 8 — Kiểm tra agent

**Command/action**

- Trong OpenKei extension, mở 1 chat session mới và chat: `ping all agents`

**Success**

- Có agent phản hồi.

**If fail**

- Quay lại Step 3 (cài plugin).
- Quay lại Step 5 (auth Atlassian MCP).
- Quay lại Step 7 (sửa config + reload VS Code).
