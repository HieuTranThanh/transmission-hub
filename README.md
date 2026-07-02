# Transmission Hub

Ứng dụng web dùng để tra cứu dữ liệu mạng truyền dẫn, tự động phát hiện các
lỗi/rủi ro, và xác định các tài nguyên IP/interface/VLAN/VRF có thể thu hồi
(reclaim) — xây dựng trên Vite + React + TypeScript + Tailwind CSS + Supabase.

Ứng dụng đọc 3 file Excel mẫu (`ipvlan_inventory_*.xlsx`,
`ospf_baseline_*.xlsx`, `bgp_audit_*.xlsx`), nhập (import) chúng vào Supabase
thành một batch có phiên bản (versioned), chạy bộ máy quy tắc audit +
resource-reclaim trên dữ liệu, và hiển thị kết quả qua dashboard, trung tâm
tìm kiếm (Search Center) thống nhất, và các trang chi tiết.

Bộ engine sơ đồ topology OSPF hiện có (`ospf_topology.py` và file
`ospf_topology_*.html` được tạo ra) **không** bị viết lại — file HTML mới
nhất được nhúng (embed) dạng chỉ-đọc vào trang Topology.

## Công nghệ sử dụng

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS (theme sáng/light)
- react-router-dom v6
- Supabase (Postgres + PostgREST), `@supabase/supabase-js`
- `xlsx` (SheetJS) — dùng cho cả script import và xuất Excel ở phía client

## Yêu cầu trước khi bắt đầu

- Node.js 18+
- Một project Supabase (dùng bản free là đủ)

## Bước 1. Cài dependencies

```bash
npm install
```

## Bước 2. Thiết lập database Supabase

1. Tạo một project Supabase (hoặc dùng project đã có sẵn).
2. Mở **SQL Editor** trong Supabase dashboard và chạy toàn bộ nội dung file
   [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
   File này có thể chạy lại nhiều lần (idempotent) mà không lỗi.

Việc này sẽ tạo ra:

- Các bảng cơ sở: `import_batches`, `devices`, `ip_assignments`,
  `ospf_interfaces`, `ospf_neighbors`, `ospf_errors`, `bgp_summary`,
  `bgp_neighbors`, `bgp_errors`, `audit_findings`, `resource_candidates`,
  `audit_exceptions`.
- Row Level Security (RLS) được bật trên tất cả các bảng, với policy
  "Public read" cho phép role `anon` chỉ được `select`. **Không có policy
  insert/update/delete cho `anon`** — mọi việc ghi dữ liệu đều thông qua
  script import bằng service role key, key này bỏ qua (bypass) RLS.
- Các view `latest_*` (ví dụ `latest_ip_assignments`, `latest_audit_findings`,
  `latest_resource_candidates`, `latest_bgp_neighbors`,
  `latest_ospf_neighbors`, ...) luôn phản ánh batch import **gần nhất đã hoàn
  tất** (`completed`). Mọi trang trong app đều đọc từ các view này, nên chạy
  import lại sẽ không bao giờ trộn lẫn dữ liệu của 2 batch khác nhau.
- `dashboard_summary`, một view tổng hợp chỉ có 1 dòng, dùng cho trang
  Dashboard và Routing Health. View này không có mệnh đề `FROM`, nên luôn trả
  về đúng 1 dòng, ngay cả khi chưa chạy import lần nào (`latest_batch_id` sẽ
  là `null` trong trường hợp đó).
- `search_ip_assignments_by_subnet(cidr)`, một RPC dùng cho Search Center khi
  tìm theo subnet/CIDR (PostgREST không có toán tử "contained by" cho kiểu
  `inet`/`cidr`).

> **Nâng cấp database đã triển khai trước đó:** file migration là idempotent —
> chạy lại toàn bộ là an toàn. Lần này có thêm 2 cột `vrf_instance` và
> `intf_status` trên bảng `audit_findings` (phục vụ các bộ lọc Service/Status/VRF
> ở trang IP Audit). Sau khi chạy lại migration, hãy chạy lại
> `npm run import:samples` để các cột mới được điền dữ liệu.

## Bước 3. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Điền vào file `.env` các giá trị lấy từ **Project Settings → API** trong
Supabase:

| Biến | Dùng ở đâu | Ghi chú |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend + script import | URL của project |
| `VITE_SUPABASE_ANON_KEY` | chỉ frontend | Public key, bị RLS giới hạn chỉ-đọc |
| `SUPABASE_SERVICE_ROLE_KEY` | chỉ script import | **Bí mật.** Không bao giờ dùng ở frontend, không bao giờ lộ ra trình duyệt |

File `.env` đã được thêm vào `.gitignore`. Không commit file này lên git.

## Bước 4. Nhập dữ liệu mẫu

```bash
npm run import:samples
```

Lệnh này đọc file mới nhất theo từng tiền tố `ipvlan_inventory_*.xlsx`,
`ospf_baseline_*.xlsx` và `bgp_audit_*.xlsx` ở thư mục gốc project, tạo một
dòng mới trong `import_batches`, chèn toàn bộ dữ liệu đã xử lý, chạy bộ máy
quy tắc audit và resource-reclaim, rồi đánh dấu batch là `completed`. Mỗi lần
chạy lại lệnh này sẽ tạo ra một batch **mới** — các batch cũ vẫn được giữ lại
để xem lịch sử (xem trang Import History), nhưng các view `latest_*` sẽ ngay
lập tức chuyển sang dùng batch mới nhất.

## Bước 4b. Import Tự Động Bằng Python (`import_data.py`)

File [`import_data.py`](import_data.py) là bản thay thế của `npm run import:samples` dành
cho môi trường **sản xuất / tự động hóa**. Không yêu cầu Node.js trên máy chạy,
phù hợp để cài vào **Task Scheduler** hoặc `cron` trên bất kỳ máy nào có Python.

Điểm khác biệt so với lệnh npm:

| | `npm run import:samples` | `import_data.py` |
|---|---|---|
| Xóa dữ liệu cũ | Không (giữ batch cũ) | **Có** (xóa sạch rồi insert mới) |
| Archive file xlsx | Không | Chuyển vào thư mục `imported/` sau khi upload |
| Yêu cầu runtime | Node.js 18+ | Python 3.10+ |
| Ghi log ra file | Không | Có (tùy chọn) |
| Chạy tự động | Cần `.bat` gọi npm | Lên lịch trực tiếp |

### Yêu cầu

- Python **3.10** trở lên
- Kết nối Internet đến Supabase

### Cài thư viện (chỉ làm 1 lần)

```bash
pip install openpyxl supabase python-dotenv
```

> Nếu trên máy có nhiều phiên bản Python, thay `pip` bằng `pip3` hoặc
> `py -m pip` (Windows).

### Cấu hình

Mở file `import_data.py` bằng bất kỳ text editor nào và chỉnh phần **CONFIG**
ở đầu file:

```python
# Đường dẫn thư mục chứa file xlsx
# Để rỗng ("") để dùng thư mục chứa file script này
WATCH_DIR = ""

# Tên thư mục lưu file đã import (tạo tự động)
ARCHIVE_SUBDIR = "imported"

# Credentials Supabase — điền trực tiếp ở đây ...
SUPABASE_URL = ""
SUPABASE_SERVICE_ROLE_KEY = ""

# ... hoặc để rỗng và đặt trong file .env:
# VITE_SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Tùy chọn: ghi log ra file (để rỗng = chỉ in ra console)
LOG_FILE = ""
# Ví dụ: LOG_FILE = r"C:\Logs\transmission_hub.log"
```

> **Bảo mật:** `SUPABASE_SERVICE_ROLE_KEY` là secret — đừng commit vào git.
> Nên để trong file `.env` thay vì hardcode vào script.

### Chạy thủ công

```bash
# Đứng ở thư mục chứa file, chạy:
python import_data.py
```

Kết quả in ra console (và ra `LOG_FILE` nếu đã cấu hình):

```
2026-06-17 08:00:01  INFO     Transmission Hub — Auto Data Import
2026-06-17 08:00:01  INFO     Tìm file Excel mới nhất...
2026-06-17 08:00:01  INFO       inventory : ipvlan_inventory_20260614.xlsx
2026-06-17 08:00:01  INFO     Xóa dữ liệu cũ trên Supabase (CASCADE)...
2026-06-17 08:00:03  INFO     Insert dữ liệu lên Supabase...
2026-06-17 08:00:25  INFO     Chạy audit rule engine...
2026-06-17 08:00:26  INFO       74 findings
2026-06-17 08:00:27  INFO     Chuyển file vào thư mục archive...
2026-06-17 08:00:27  INFO     Hoàn tất trong 28.4s | batch abc-123 | 3 file đã archive.
```

### Cài vào Windows Task Scheduler

1. Mở **Task Scheduler** → **Create Basic Task...**
2. Đặt tên, ví dụ: `Transmission Hub Import`
3. Chọn lịch chạy (hàng tuần, hàng ngày, v.v.)
4. Action: **Start a program**

   | Trường | Giá trị |
   |---|---|
   | Program/script | `python` |
   | Add arguments | `"D:\My Drive\MobiFone\Sang kien\2026\Transmission Hub\import_data.py"` |
   | Start in | `D:\My Drive\MobiFone\Sang kien\2026\Transmission Hub` |

5. *(Tuỳ chọn)* Để lưu output ra file log, thay `Program/script` bằng đường
   dẫn tới file `.bat` sau:

   ```bat
   @echo off
   cd /d "D:\My Drive\MobiFone\Sang kien\2026\Transmission Hub"
   python import_data.py >> "D:\Logs\transmission_hub.log" 2>&1
   ```

   Hoặc đơn giản hơn, đặt `LOG_FILE` trong phần CONFIG của script để script
   tự ghi log (khuyến nghị).

6. Tick **Run whether user is logged on or not** để chạy nền kể cả khi chưa
   đăng nhập.

### Flow hoạt động

```
Task Scheduler kích hoạt
        ↓
Tìm file mới nhất theo từng prefix
  ipvlan_inventory_*.xlsx    →  lấy file mới nhất (bắt buộc)
  ospf_baseline_*.xlsx       →  lấy file mới nhất (bắt buộc)
  bgp_audit_*.xlsx           →  lấy file mới nhất (bắt buộc)
  ospf_topology_*.html       →  lấy file mới nhất (tùy chọn)
        ↓
Xóa toàn bộ dữ liệu cũ trên Supabase
  (DELETE import_batches CASCADE → tất cả bảng con tự cascade)
        ↓
Đọc và upload dữ liệu mới
  devices / ip_assignments / ospf_* / bgp_* → Supabase
        ↓
Chạy rule engine
  audit_findings + resource_candidates → Supabase
        ↓
Cập nhật import_batches.status = 'completed'
        ↓
Upload topology HTML lên Supabase Storage (nếu có file mới)
  ospf_topology_*.html  →  bucket "topology" / ospf_topology.html (upsert)
        ↓
Chuyển TẤT CẢ file (xlsx + topology html) vào thư mục imported/
```

---

## Bước 5. Chạy ứng dụng

```bash
npm run dev
```

Mở đường link local được in ra (mặc định `http://localhost:5173`).

Nếu bạn mở app trước khi bước 4 chạy xong, mọi trang sẽ hiển thị trạng thái
trống (empty state) và hướng dẫn chạy `npm run import:samples`.

## Cập nhật dữ liệu định kỳ

Các file Excel trong project đại diện cho **định dạng đầu ra** của tool thu thập
dữ liệu mạng (`Transmission Tool`). Quy trình cập nhật dự kiến **hàng tuần**:

1. Tool thu thập chạy (SSH/SNMP), xuất 3 file Excel **cùng cấu trúc cột/sheet**:
   `ipvlan_inventory_<timestamp>.xlsx`, `ospf_baseline_<timestamp>.xlsx`,
   `bgp_audit_<timestamp>.xlsx`.
2. Copy 3 file mới vào thư mục gốc project (cùng chỗ với `import_data.py`).
3. **Task Scheduler** tự động chạy `import_data.py` theo lịch đã cài.
4. Script xóa dữ liệu cũ, upload mới, chạy rule engine, rồi archive các file xlsx.

### Vì sao không cần sửa code mỗi tuần

Cả `import_data.py` lẫn `import-samples.ts` đều tự chọn file **mới nhất** theo
từng tiền tố (`ipvlan_inventory_*`, `ospf_baseline_*`, `bgp_audit_*`) — chỉ cần
thả file mới vào là chạy được, không phải đổi tên hay sửa đường dẫn.

### Hai cách chạy (chọn 1)

- **Khuyến nghị — `import_data.py`:** thuần Python, không cần Node.js trên máy
  chạy. Xem hướng dẫn đầy đủ ở [Bước 4b](#bước-4b-import-tự-động-bằng-python-import_datapy).

- **Thay thế — `npm run import:samples`:** nếu Node.js đã có sẵn. Không tự xóa
  dữ liệu cũ (giữ lại tất cả batch để xem lịch sử), không tự archive file.
  Lên lịch bằng file `.bat`:

  ```bat
  cd /d "D:\My Drive\MobiFone\Sang kien\2026\Transmission Hub"
  call npm run import:samples
  ```

## Các lệnh khác

```bash
npm run build   # kiểm tra type (tsc -b) + build bản production
npm run preview # xem trước bản build production
npm run lint    # chỉ kiểm tra type (tsc -b --noEmit)
```

## Deploy lên GitHub + Cloudflare Pages

### Bước 1 — Kết nối Cloudflare Pages với GitHub (chỉ làm 1 lần)

1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Vào **Pages** → **Create a project** → **Connect to Git**
3. Chọn repository `HieuTranThanh/transmission-hub`
4. Cấu hình build:

| Thiết lập | Giá trị |
|---|---|
| Framework preset | `None` (hoặc `Vite`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `18` trở lên |

5. Thêm biến môi trường (Environment variables) trong Cloudflare Pages:

| Tên biến | Giá trị |
|---|---|
| `VITE_SUPABASE_URL` | URL project Supabase của bạn |
| `VITE_SUPABASE_ANON_KEY` | Anon key của Supabase |

> **Lưu ý:** Chỉ thêm 2 biến `VITE_*` — không thêm `SUPABASE_SERVICE_ROLE_KEY` vào Cloudflare Pages, đây là key bí mật chỉ dùng khi chạy script import ở local.

6. Click **Save and Deploy**

---

### Bước 2 — Push code lên GitHub (mỗi lần cập nhật)

Chạy file **`deploy.bat`** (double-click hoặc từ terminal):

```
deploy.bat
```

Script hỏi chế độ deploy:

- **[N] Push bình thường** — commit và push code mới lên, Cloudflare tự động build
- **[X] Xóa sạch GitHub** — xóa toàn bộ lịch sử git, push lại từ đầu (dùng khi muốn reset hoàn toàn)
- **[T] Thoát**

Sau khi push thành công, Cloudflare Pages sẽ **tự động** kéo code và build. Xem tiến trình tại:

```
https://dash.cloudflare.com → Pages → transmission-hub
```

---

### Lưu ý triển khai

- File `public/_redirects` đã cấu hình sẵn để React Router hoạt động đúng trên Cloudflare Pages. Nếu thiếu file này, người dùng truy cập trực tiếp URL (ví dụ `/ip-audit`) sẽ nhận lỗi 404.
- File `.env` đã có trong `.gitignore` — sẽ không bị push lên GitHub.
- Biến môi trường trên Cloudflare Pages (bước 1.5) cần thiết để app production kết nối được Supabase; nếu thiếu, app sẽ load nhưng không có dữ liệu.

---

## Danh sách các trang

| Route | Chức năng |
| --- | --- |
| `/` | Dashboard — số liệu tổng hợp về inventory, audit, routing, reclaim; danh sách top findings/candidates |
| `/search` | Search Center — tra cứu theo IP, subnet (CIDR), VLAN ID, tên thiết bị, hoặc interface trên toàn bộ dữ liệu |
| `/ip-audit` | Các phát hiện audit liên quan IP (trùng IP, lỗi network/gateway/status/prefix) |
| `/routing` | Routing health — các phát hiện BGP/OSPF, danh sách BGP peer, OSPF neighbor |
| `/reclaim` | Các tài nguyên có thể thu hồi (IP/interface/VLAN không dùng) |
| `/topology` | Nhúng (chỉ đọc) file HTML sơ đồ topology OSPF mới nhất |
| `/imports` | Lịch sử các lần import |

## Quy ước UI — Bảng dữ liệu

**Mọi bảng dữ liệu hiển thị trên UI đều phải hỗ trợ sắp xếp (sort) theo header,
cả chiều A–Z (tăng dần) lẫn Z–A (giảm dần).** Ngoại lệ duy nhất là trang
Topology (chỉ nhúng HTML, không có bảng).

- Tất cả các bảng dùng chung component [`DataTable`](src/components/DataTable.tsx).
  Mỗi cột muốn sort được chỉ cần đặt `sortable: true`; nhấp vào header sẽ xoay
  vòng 3 trạng thái: chưa sort → A–Z → Z–A → chưa sort.
- **Bảng phân trang phía server** (IP Audit, Reclaim, các tab của Routing):
  truyền `sort` + `onSortChange` cho `DataTable`, và chuyển `sort` xuống hàm
  fetch trong `src/data/*` để áp `.order()` trên Supabase (có whitelist cột
  hợp lệ, kèm tiebreaker `id` để giữ phân trang ổn định).
- **Bảng dữ liệu nằm sẵn trong bộ nhớ** (Imports, top tables ở Dashboard, các
  nhóm kết quả ở Search Center): chỉ cần đặt `sortable: true` và cung cấp
  `sortAccessor` cho mỗi cột — `DataTable` tự sắp xếp phía client.
- Khi thêm trang/bảng mới, phải tuân thủ quy ước này.

## Quy ước UI — Bộ lọc (Filter)

**Trên mọi trang có từ 2 bộ lọc dạng dropdown/select trở lên, các bộ lọc đó
phải "liên kết" (cascading) với nhau — giống cơ chế filter lồng nhau của
Excel.** Chọn một giá trị ở filter này phải thu hẹp danh sách lựa chọn của
các filter còn lại xuống chỉ những giá trị còn khả năng cho ra kết quả; nếu
một lựa chọn đang chọn không còn hợp lệ sau khi filter khác đổi, tự động
reset filter đó về "Tất cả..." (không để bảng kẹt ở tổ hợp filter rỗng).

- Dùng helper chung [`cascadingOptions`](src/lib/cascading-filters.ts):
  - Mỗi trang fetch **một lần** toàn bộ các cột filter liên quan (dạng
    `fetch...FilterRows`, xem `src/data/audit.ts`, `src/data/reclaim.ts`,
    `src/data/routing.ts`), rồi tính danh sách lựa chọn cho từng dropdown
    ngay phía client bằng `cascadingOptions(rows, selections, targetKey)` —
    trong đó `selections` là giá trị hiện tại của *tất cả* các filter
    (key phải trùng tên cột), và hàm sẽ tự loại trừ filter đang tính khỏi
    điều kiện của chính nó.
  - Thêm một `useEffect` reset filter về `"all"` nếu giá trị đang chọn không
    còn nằm trong danh sách vừa tính (xem ví dụ trong `IpAudit.tsx`,
    `Reclaim.tsx`, `Routing.tsx`).
  - Filter dạng multi-select theo substring (vd. "Lý do" ở trang Reclaim)
    không dùng `cascadingOptions` trực tiếp — lọc rows theo điều kiện OR của
    nó trước, rồi mới cascade các filter dạng equality còn lại; xem
    `Reclaim.tsx`.
  - Ô tìm kiếm tự do (free-text search) **không** tham gia cascading — chỉ
    các filter dạng dropdown/checkbox theo cột mới cần liên kết.
- **Khi thêm filter mới vào một trang đã có filter khác (hoặc thêm trang
  mới có ≥2 filter), phải đưa filter đó vào cùng cơ chế cascading này.**

## Search Center

Search Center là luồng tra cứu chính của ứng dụng. Hệ thống tự nhận diện
chuỗi tìm kiếm là địa chỉ IP, subnet CIDR, VLAN ID, hay văn bản tự do, và lưu
chuỗi tìm kiếm vào URL (`?q=...`) để có thể chia sẻ hoặc lưu bookmark. Kết quả
được nhóm theo: Inventory, BGP Summary/Neighbors, OSPF Interfaces/Neighbors,
Audit Findings và Reclaim Candidates. Click vào một dòng bất kỳ sẽ mở ngăn
chi tiết (detail drawer) hiển thị toàn bộ thông tin liên quan đến IP/thiết bị
đó — các dòng inventory liên quan, các audit finding, trạng thái reclaim, và
thông tin BGP/OSPF liên quan.

## Xuất dữ liệu (Export)

Chỉ hỗ trợ xuất ra Excel (`.xlsx`), qua nút **Export** trên các trang IP
Audit, Routing Health, Resource Reclaim và Search Center.

- Trang IP Audit, Routing Health và Resource Reclaim xuất **các dòng đang
  hiển thị trên trang hiện tại** (tức là trang đã lọc/phân trang hiện tại,
  không phải toàn bộ kết quả lọc) — có ghi chú nhỏ dưới mỗi bảng để nhắc điều
  này.
- Search Center xuất ra một file Excel nhiều sheet, mỗi nhóm kết quả một
  sheet (sheet không có dữ liệu sẽ bị bỏ qua).

Tên file có kèm ngày hiện tại, ví dụ: `audit-findings-2026-06-13.xlsx`,
`resource-reclaim-2026-06-13.xlsx`, `routing-findings-2026-06-13.xlsx`,
`search-results-2026-06-13.xlsx`.

## Topology

Trang `/topology` nhúng file topology OSPF vào một iframe. File được lưu trên
**Supabase Storage** (bucket `topology`, object `ospf_topology.html`) thay vì
đóng gói tĩnh trong bản build — nhờ đó có thể cập nhật sơ đồ mới **mà không
cần deploy lại web**.

### Thiết lập bucket (chỉ làm 1 lần)

1. Vào **Supabase Dashboard → Storage → New bucket**
2. Đặt tên: `topology`
3. Chọn **Public** (bắt buộc để iframe có thể load không cần xác thực)

### Cập nhật sơ đồ mới

Đặt file `ospf_topology_<timestamp>.html` vào thư mục nguồn rồi chạy
`import_data.py` — script tự tìm file mới nhất theo prefix `ospf_topology_*`,
upload đè lên `ospf_topology.html` trong bucket, rồi archive file gốc. Trang
web cập nhật ngay sau khi script hoàn tất, không cần push code.

Nếu không có file topology trong thư mục nguồn, script bỏ qua bước này và
vẫn import Excel bình thường. Nếu bucket chưa được tạo hoặc upload thất bại,
script chỉ log warning và tiếp tục — không dừng quá trình import.

Nếu file topology chưa có trên Storage, trang sẽ hiển thị trạng thái trống
kèm hướng dẫn thay vì iframe bị lỗi.

## Cấu trúc project

```
src/
  components/   UI dùng chung (AppShell, Sidebar, DataTable, DetailDrawer, badge mức độ, ...)
  data/         các module truy vấn Supabase (mỗi trang/lĩnh vực một module)
  lib/          Supabase client, helper IP/CIDR, xuất Excel, định dạng (format)
  pages/        mỗi route một file
scripts/
  import-samples.ts   import 3 file Excel mẫu (chỉ dùng service role key)
  lib/                chuẩn hóa dữ liệu + bộ máy quy tắc audit/reclaim
supabase/migrations/  schema SQL, policy RLS, view, RPC
docs/data-profile.md  tài liệu mô tả cột dữ liệu trong các file Excel nguồn
public/topology/      file HTML topology OSPF tĩnh (dự phòng; bản chạy dùng Supabase Storage)
```

## Lưu ý về bảo mật

- Frontend (`src/lib/supabase.ts`) chỉ được khởi tạo với
  `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Các policy RLS giới hạn
  role `anon` chỉ được `select` (chỉ đọc) trên tất cả các bảng.
- Script import (`scripts/import-samples.ts`) chỉ được khởi tạo với
  `SUPABASE_SERVICE_ROLE_KEY` và tuyệt đối không được chạy ở trình duyệt.
- Ứng dụng không thực hiện bất kỳ thay đổi phá hủy (destructive) nào lên dữ
  liệu mạng — toàn bộ là chỉ-đọc, ngoại trừ script import chỉ thực hiện thêm
  (insert) dòng mới.
