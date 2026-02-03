# AI 客服系統 (LINE + Supabase + React)

這是一個企業級的 AI 客服後台，整合了 LINE Messaging API、OpenAI GPT、Google Gemini 與 Supabase 資料庫。

## 🚀 部署流程與環境變數設定

本專案設計為 **「零本機設定檔案」**，您可以完全透過 Netlify 控制台管理所有敏感資訊。

### 1. 資料庫設定 (Supabase)
1. 建立 [Supabase](https://supabase.com/) 專案。
2. 在 **SQL Editor** 執行專案目錄下的 `supabase_schema.sql` 以建立資料表。
3. 在 **Authentication -> Users** 建立一組管理員 Email/密碼（用於登入後台）。

### 2. 環境變數設定 (Netlify)
將程式碼推送到 GitHub 並連結至 Netlify 後，請在 Netlify 的 **Site configuration > Environment variables** 設定以下四個變數：

| 變數名稱 | 來源 | 說明 |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Supabase Settings > API | 前端連接資料庫用 |
| `VITE_SUPABASE_ANON_KEY` | Supabase Settings > API | 前端公開金鑰 |
| `SUPABASE_URL` | Supabase Settings > API | 後端 Function 用 (與前端相同) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings > API | **極重要！** 後端專用最高權限金鑰，請勿外流 |

> **💡 為什麼有兩個 URL？** 
> `VITE_` 開頭的變數會被編譯進前端網頁；而沒有 `VITE_` 的變數則專供 Netlify Functions (後端) 使用，安全性更高。

### 3. 本地開發 (不使用 .env 檔案)
若您不想在電腦建立 `.env` 檔案，請使用 **Netlify CLI** 將雲端設定抓回本地：

1. 安裝 CLI: `npm install -g netlify-cli`
2. 登入: `netlify login`
3. 連結專案: `netlify link`
4. 啟動開發環境: `netlify dev`

執行 `netlify dev` 後，系統會自動模擬 Netlify 環境並讀取雲端變數，您的本地網頁即可正常運作。

### 4. LINE Webhook 串接
1. 部署完成後，您的 Webhook 地址為：`https://你的網址.netlify.app/.netlify/functions/line-webhook`
2. 將此網址填入 **LINE Developers Console** 的 Webhook URL 欄位並開啟 "Use webhook"。

---

## 🛠️ 功能亮點
- **雙 AI 引擎切換**：隨時切換 GPT 或 Gemini。
- **上下文記憶對話**：自動推算最近 5 筆對話，提供連貫的服務體驗。
- **真人轉接機制**：設定關鍵字（如：真人、客服）自動切換模式，並支援超時自動轉回 AI。
- **知識庫參考**：可輸入純文字參考資料，AI 會優先參考該資訊回答。
- **對話記錄監控**：後台即時顯示最近 100 筆互動記錄。