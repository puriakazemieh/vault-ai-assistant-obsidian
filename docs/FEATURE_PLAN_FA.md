# نقشهٔ راه AI Vault Memory

این سند مسیر تکامل افزونه را از «چت متصل به API» به یک دستیار دانش شخصیِ فارسی‌محور، با حفظ کنترل کاربر روی داده‌ها و تغییرات vault، مشخص می‌کند.

## وضعیت فعلی

افزونه اکنون این قابلیت‌ها را دارد:

- چت با APIهای OpenAI-compatible و انتخاب مدل.
- ایندکس خودکار Markdown، بازیابی واژه‌محور، فایل‌های پیوست و متن انتخاب‌شده.
- پاسخ استریم، تاریخچهٔ محلی گفتگو، تحلیل فایل فعال، inline prompt و مقایسهٔ دو فایل.
- رابط فارسی و انگلیسی.

بازیابی فعلی semantic واقعی نیست: `MemoryStore` بر اساس هم‌پوشانی tokenها امتیاز می‌دهد. بنابراین جست‌وجوی معنایی، دقت citation و شفافیت context باید هستهٔ نسخهٔ بعد باشند.

## اصول محصول

1. **Persian-first:** نرمال‌سازی فارسی، promptها و workflowهای آماده برای نوشتن، پژوهش و برنامه‌ریزی فارسی.
2. **Local-first:** ایندکس، تاریخچه و کنترل context روی دستگاه بمانند؛ فقط context صریحاً لازم به provider ارسال شود.
3. **Human-in-the-loop:** هر تغییر فایل، frontmatter یا ساخت note باید preview، diff و تأیید داشته باشد.
4. **منبع‌پذیر:** پاسخ‌های مبتنی بر vault باید مسیر، heading و context استفاده‌شده را نشان دهند.
5. **Provider-neutral، با تجربهٔ بهتر NaraRouter:** OpenAI-compatible بودن حفظ شود، اما قابلیت‌های اختیاری NaraRouter افزوده شوند.

## یافته‌های رقابتی

| الگو | نمونه | برداشت برای افزونه |
|---|---|---|
| Agentها، context انتخابی، مجوزها و commandهای قابل استفادهٔ مجدد | [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) | فعلاً به‌جای agent خودکار، context picker، command و مدل مجوزمحور بسازیم. |
| قالب‌ها و پیکربندی مبتنی بر frontmatter | [Text Generator](https://github.com/nhaouari/obsidian-textgenerator-plugin) | prompt profile و فرمان‌های reusable، با override در frontmatter. |
| Profile، slash command و ذخیرهٔ history به Markdown | [BMO Chatbot](https://github.com/longy2k/obsidian-bmo-chatbot) | persona/profile و تبدیل گفتگو به note قابل جست‌وجو. |
| نوت‌های مرتبط، embedding محلی و جست‌وجوی معنایی | [Smart Connections](https://github.com/gmifsud/gd.obsidian.smart-connections.plugin) | یک نمای Related Notes که با note فعال به‌روز می‌شود و لینک ایجاد می‌کند. |
| BM25 + semantic + RRF + rerank | [Obsidian QMD Search](https://github.com/thirteen37/obsidian-qmd) | hybrid retrieval به‌جای جایگزینی کامل keyword search. |
| چت، workflow، skill، usage و عملیات vault | [Gemini Helper](https://github.com/takeshy/obsidian-gemini-helper) | usage panel، workflowهای محدود و skillهای بسته‌بندی‌شده در مراحل بعد. |
| متن، تصویر، وب و PDF در prompt | [AI Commander](https://github.com/yzh503/obsidian-aicommander-plugin) | context برای PDF/تصویر و research وب، پس از تثبیت RAG متنی. |

## فرصت‌های NaraRouter

NaraRouter با base URL `https://router.bynara.id/v1` از Chat Completions، Models، Embeddings، Rerank، reasoning effort، web tools و model combos پشتیبانی می‌کند.

- **Embedding + rerank:** `/v1/embeddings` و `/v1/rerank` برای RAG دقیق‌تر.
- **Reasoning:** ارسال `reasoning_effort` برای مدل‌های reasoning؛ روی مدل‌های دیگر بدون اثر است.
- **Web research:** suffix `:online` یا `plugins: [{ id: "web", max_results }]`؛ باید کاملاً opt-in باشد و منابع را نمایش دهد.
- **Model combo:** fallback سمت NaraRouter برای مدل‌های ناپایدار یا quota-exhausted.
- **Usage و خطاها:** خواندن usage هر پاسخ، هندل‌کردن 429 و 503 با backoff و پیام قابل‌فهم.

منبع مرجع: [NaraRouter API documentation](https://router.bynara.id/docs).

## P0 — ایمنی و پایداری

### 1. اصلاح parser استریم

**مسئله:** parser فعلی فقط `choices[0].message.content` را می‌خواند؛ stream استاندارد OpenAI/NaraRouter محتوا را در `choices[0].delta.content` می‌فرستد.

**طرح:**

- تابع parser را به دو مسیر completion و delta تقسیم کنیم.
- تست واحد برای JSON completion، SSE delta، `[DONE]` و event خطا اضافه کنیم.
- در رابط کاربری، پاسخ ناقصِ لغوشده را با وضعیت مشخص نگه داریم.

### 2. جریان امن تغییر فایل

**مسئله:** بلوک `file-create` می‌تواند فایل موجود را بی‌درنگ overwrite کند.

**طرح:**

- مدل فقط یک پیشنهاد ساختاریافته برگرداند: مسیر، عملیات، محتوا و توضیح.
- قبل از نوشتن، modal شامل diff و دکمه‌های Apply / Reject / Regenerate نمایش داده شود.
- مسیرهای نامعتبر، پوشه‌های سیستمی و overwrite بدون تأیید رد شوند.
- همهٔ عملیات در history قابل بازبینی باشند.

### 3. حریم خصوصی، secrets و resiliency

- API key را با Secret Storage/Keychain ابسیدین ذخیره کنیم، مشروط به سازگاری minAppVersion.
- در نبود storage امن، هشدار روشن و گزینهٔ حذف credential نمایش دهیم.
- 429 و 503 را با exponential backoff، retry محدود و پیشنهاد مدل جایگزین مدیریت کنیم.
- context ارسالی، provider و دلیل ارسال را در UI نمایش دهیم.

## P1 — هستهٔ تجربهٔ دانش شخصی

### 4. RAG واقعی و hybrid retrieval

**هدف:** پاسخ‌های دقیق‌تر، با استفاده از مفهوم و کلیدواژه، نه فقط تطابق متن.

**طرح فنی:**

1. chunk فعلی Markdown را با metadata مسیر، heading و hash نگه داریم.
2. برای chunkهای تازه یا تغییرکرده embedding بسازیم؛ فقط hashهای تغییرکرده دوباره embed شوند.
3. BM25/keyword score و cosine similarity را با Reciprocal Rank Fusion ترکیب کنیم.
4. 20 نتیجهٔ اول را به `/v1/rerank` بفرستیم و 5 نتیجهٔ برتر را وارد prompt کنیم.
5. citationهای `[[path#heading]]`، score و preview context را در پاسخ نمایش دهیم.

**تنظیمات:** provider embedding، مدل embedding، مدل rerank، تعداد candidate/final context، سقف context و گزینهٔ خاموش‌کردن cloud embedding.

### 5. Related Notes و Semantic Lookup

- sidebar برای note فعال با نوت‌ها و headingهای مرتبط.
- جست‌وجوی معنایی مستقل با preview، breadcrumb heading و بازکردن محل دقیق.
- drag-and-drop نتیجه برای ساخت `[[link]]` در note.
- گزینهٔ hide/unhide برای پیشنهادهای نامرتبط.

### 6. Inline editing با preview

- actionهای آماده: خلاصه، بازنویسی، گسترش، ساده‌سازی، اصلاح نگارش، ترجمه و تبدیل به task.
- خروجی در diff view نمایش داده شود، نه جایگزینی مستقیم selection.
- دکمه‌های Apply، Copy، Replace selection، Insert below و Regenerate.
- پشتیبانی از prompt profile یا frontmatter برای لحن و زبان هر note.

### 7. Prompt Command و Profile

- commandهای ذخیره‌شده با متغیرهای `{{selection}}`، `{{active_note}}`، `{{linked_notes}}` و `{{date}}`.
- profileهای فارسی پیش‌فرض: پژوهشگر، ویراستار، خلاصه‌ساز جلسه، برنامه‌ریز و منتقد.
- frontmatter override مانند `ai-profile`، `ai-model` و `ai-context-folders`.
- import/export profile در Markdown یا JSON.

### 8. گفتگو به‌عنوان بخشی از vault

- Export هر گفت‌وگو به Markdown با frontmatter مدل، provider، زمان، usage و منابع.
- ذخیره در پوشهٔ قابل تنظیم مانند `AI Conversations/`.
- حفظ لینک به noteها و headingهای استفاده‌شده در هر پاسخ.

## P2 — پژوهش، هزینه و workflow

### 9. Research with sources

- toggle صریح «جست‌وجوی وب»؛ در حالت فعال model با `:online` یا web plugin فراخوانی شود.
- دامنه‌های مجاز/مسدودشده، تعداد نتیجه و هشدار هزینه قابل تنظیم باشند.
- منابع پاسخ به‌صورت لینک، با جداکردن واضح محتوای vault از محتوای وب نمایش داده شوند.

### 10. انتخاب مدل و کنترل هزینه

- دسته‌بندی مدل‌ها با قابلیت‌ها: reasoning، vision، streaming و online.
- presetهای Fast / Balanced / Deep Research.
- نمایش model id، token usage، latency و هزینهٔ تقریبی هر پاسخ.
- پشتیبانی از Nara model combos و fallback محلی در تنظیمات.

### 11. Frontmatter و task assistant

- استخراج تگ، نوع note، پروژه، status و task با confidence.
- پیش‌نمایش YAML و تأیید کاربر قبل از تغییر.
- digest روزانه/هفتگی از noteهای تازه یا تغییرکرده.

### 12. Context Packs

- مجموعهٔ نام‌دار از noteها، queryها و دستورالعمل‌ها برای پروژه/جلسه.
- امکان attach به چت یا یک note با code block.
- نمونه‌ها: آماده‌سازی جلسه، تدوین مقاله، تحقیق محصول و مرور پروژه.

## P3 — رسانه، ساختارهای Obsidian و agent محدود

- تولید cover image و ذخیره در پوشهٔ دارایی تنظیم‌پذیر.
- استخراج متن از PDF و تصویر با ارسال کاملاً اختیاری به provider مناسب.
- ساخت Canvas از brainstorming یا تبدیل جلسه به project map.
- خروجی task/project برای Bases، در صورت وجود API پایدار.
- skillهای بسته‌بندی‌شده و workflow چندمرحله‌ای، اما فقط با سطح دسترسی و تأیید مرحله‌ای.

## مواردی که فعلاً نباید اولویت بگیرند

- agent خودکار با دسترسی کامل به vault؛ ابتدا P0 و الگوی تأیید تغییر را کامل کنیم.
- تولید ویدئو؛ قابلیت NaraRouter است اما با مسئلهٔ اصلی knowledge management هم‌راستا نیست.
- وابستگی اجباری به provider واحد؛ OpenAI-compatible بودن مزیت راهبردی افزونه است.

## ترتیب پیشنهادی اجرا

1. P0: parser استریم، diff/approval برای فایل، secrets و retry.
2. P1: embedding cache، hybrid search، rerank و citation UI.
3. P1: Related Notes، inline diff editor، command/profile و chat export.
4. P2: web research، usage/budget، frontmatter assistant و context packs.
5. P3: رسانه، Canvas/Bases و workflowهای skill-based.

## معیار پذیرش نسخهٔ بعدی

- استریم NaraRouter و OpenAI-compatible در desktop و fallback غیر-stream در mobile درست عمل کند.
- هیچ فایل vault بدون preview و تأیید کاربر نوشته یا overwrite نشود.
- هر پاسخ RAG حداقل یک citation قابل‌کلیک داشته باشد، یا صریحاً کمبود context را اعلام کند.
- تغییر فقط در noteهای modified باعث re-embedding شود.
- کاربر بتواند هر provider ابری و embedding cloud را خاموش کند.
- build، lint و تست‌های parser/retrieval قبل از انتشار پاس شوند.
