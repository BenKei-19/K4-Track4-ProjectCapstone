# SafeLens — Đặc tả kỹ thuật (v1, hackathon)

> Ứng dụng web mobile-first ước lượng **khoảng cách (mét) từ camera tới xe phía trước** bằng một camera đơn, **AI chạy hoàn toàn trên thiết bị** (WASM), không backend.
>
> Ngân sách phát triển: **≤ 75 phút**. Mọi quyết định trong tài liệu này đã chốt — không bàn lại trong giờ làm.

---

## 0. Cách đọc tài liệu

- **MUST** = bắt buộc cho bản demo. **SHOULD** = làm nếu còn giờ theo gate (mục 13). **COULD** = chỉ làm khi mọi MUST/SHOULD đã xong.
- Mọi toạ độ, đơn vị, hằng số được định nghĩa một lần ở đây và trong `src/config.ts`. Code không tự đặt "magic number".
- Nguyên tắc tối cao: **không bao giờ hiển thị một con số khoảng cách không do pipeline thật tính ra.** Khi không chắc → hiển thị trạng thái, không hiển thị số.

---

## 1. Mục tiêu & phạm vi

### 1.1 Mục tiêu

| # | Mục tiêu | Đo bằng |
|---|---|---|
| G1 | Phát hiện xe on-device trên video MP4 | Box hiển thị đúng trên xe, latency đo thật |
| G2 | Chọn xe phía trước trong vùng ROI | Box xe dẫn đầu được tô nổi bật |
| G3 | Ước lượng khoảng cách theo mặt phẳng đường | Số mét, sai số được kiểm chứng ở mốc đo thật |
| G4 | Trung thực về trạng thái | Đủ 10 trạng thái ở mục 7, không có số giả |
| G5 | Chạy offline | Tắt mạng, reload, vẫn hoạt động |
| G6 | Mobile-first | Dùng tốt ở viewport 390 px, vẫn dùng được trên desktop |

### 1.2 Phạm vi

| Mức | Tính năng |
|---|---|
| **MUST** | Upload MP4 + phát/dừng · chọn clip mẫu trong `public/demo` · ObjectDetector (EfficientDet-Lite0) chạy WASM, GPU→CPU fallback · lọc class xe · ROI hình thang neo theo đường chân trời · chọn xe dẫn đầu · khoảng cách mặt phẳng đường · hiệu chuẩn (chiều cao, vFOV, đường chân trời bằng slider) · EMA làm mượt · 10 trạng thái · đo `inferMs`, `detectHz` · asset local · UI 390 px · unit test cho logic thuần |
| **SHOULD** | Giữ xe dẫn đầu ổn định (hysteresis IoU) · kéo đường chân trời trực tiếp trên canvas · preset hiệu chuẩn cho clip mẫu (số đo thật) |
| **COULD** | Camera sau trực tiếp (`getUserMedia`, cần secure context) |
| **WON'T** | TTC, cảnh báo va chạm, nhận diện làn, tracking đa đối tượng, backend, đăng nhập, lưu trữ server |

### 1.3 Giả định & giới hạn đã biết (phải hiển thị trung thực, không che giấu)

1. Mặt đường **phẳng**; dốc hoặc chúi đầu khi phanh làm sai số tăng.
2. Đáy bbox ≈ điểm bánh sau chạm đất, **nằm sau cản sau ~1 m** → bias dương.
3. Sai số tăng theo **bình phương khoảng cách**: `Δd ≈ d² / (h·f) · Δy`. Vì vậy giới hạn tầm đo `MAX_RANGE_M = 50`.
4. ROI là heuristic "vùng phía trước", **không** khẳng định "cùng làn". UI không dùng chữ "cùng làn".
5. Chưa kiểm chứng ban đêm, mưa, đường cong.

---

## 2. Tech stack

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| Build | Vite, template `react-ts` | |
| UI | React 18+, TypeScript strict | Không dùng `enum` (Node type-stripping chỉ hỗ trợ cú pháp xoá được) |
| Style | Tailwind CSS v4 qua `@tailwindcss/vite` | Không dùng Google Fonts (offline) — system font stack |
| AI | `@mediapipe/tasks-vision` **1.1.1** (`ObjectDetector`) | Đã xác minh có `detectForVideo(frame, timestamp)` |
| Model | `efficientdet_lite0.tflite` **float16** | COCO; dùng nhãn `car`, `truck`, `bus`, `motorcycle` |
| Test | `node:test` của Node 24 (type-stripping sẵn) | Không thêm dependency test |
| Runtime | Trình duyệt Chromium (Chrome/Edge) desktop & Android | Safari: best-effort |

Không thêm dependency nào ngoài danh sách trên.

---

## 3. Cấu trúc dự án

```
/
├─ docs/SPEC.md
├─ public/
│  ├─ wasm/                         # copy nguyên thư mục từ node_modules/@mediapipe/tasks-vision/wasm
│  ├─ models/efficientdet_lite0.tflite
│  └─ demo/
│     ├─ drive.mp4                  # clip chạy xe
│     └─ static.mp4                 # clip tĩnh có mốc 5/10/15/20 m
├─ src/
│  ├─ main.tsx
│  ├─ index.css                     # @import "tailwindcss"; + design tokens
│  ├─ config.ts                     # MỌI hằng số
│  ├─ types.ts                      # data contract
│  ├─ geometry.ts                   # logic thuần: distance, ROI, lead, EMA, status
│  ├─ geometry.test.ts
│  ├─ detector.ts                   # khởi tạo MediaPipe, GPU→CPU
│  ├─ Viewport.tsx                  # <video> ẩn + <canvas>, vòng lặp detect/render
│  └─ App.tsx                       # layout, HUD, nguồn video, calibration sheet
├─ index.html
├─ vite.config.ts
└─ package.json
```

**Quy tắc:** `geometry.ts` không import React, DOM hay MediaPipe — chỉ hàm thuần, để test bằng Node.

---

## 4. Setup & asset offline

```bash
npm create vite@latest . -- --template react-ts
npm i @mediapipe/tasks-vision@1.1.1
npm i -D tailwindcss @tailwindcss/vite
mkdir -p public/wasm public/models public/demo
cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/
curl -L -o public/models/efficientdet_lite0.tflite \
  https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
```

- **Commit** `public/wasm`, `public/models`, `public/demo` vào git (vài chục MB, chấp nhận được) để clone xong là chạy offline.
- `vite.config.ts`: plugin `react()` + `tailwindcss()`; `server.host = true` để mở từ điện thoại trong LAN.
- `tsconfig.app.json`: giữ `allowImportingTsExtensions: true` (template đã có) vì test Node import `./geometry.ts`.
- `package.json` scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview --host",
  "test": "node --test src/geometry.test.ts"
}
```

**Kiểm tra offline (bắt buộc ở M1 và lúc freeze):** tắt Wi-Fi → reload → trạng thái chuyển `loading → no-video` không lỗi.

---

## 5. Hệ toạ độ (quy tắc bất biến)

| Không gian | Định nghĩa | Dùng ở đâu |
|---|---|---|
| **Video px** | Gốc trên-trái, `x ∈ [0, videoWidth)`, `y ∈ [0, videoHeight)`, y hướng xuống | Kết quả MediaPipe, `Det`, mọi phép vẽ trên canvas |
| **Normalized** | `xN = x / videoWidth`, `yN = y / videoHeight`, ∈ [0, 1] | `Calib.horizonY`, ROI, thao tác chuột/chạm |
| **CSS px** | Kích thước hiển thị trên trang | **Chỉ** dùng để đổi pointer → normalized |

1. `canvas.width = video.videoWidth`, `canvas.height = video.videoHeight`, đặt lại mỗi lần `loadedmetadata`.
2. Mỗi frame: `ctx.drawImage(video, 0, 0)` rồi vẽ overlay **trên cùng canvas**. Không chồng `<video>` hiển thị với `<canvas>`.
3. CSS canvas: `width: 100%; height: auto;` — giữ nguyên tỉ lệ, **không** `object-fit: cover`, không crop.
4. Pointer → normalized: `yN = (e.clientY - rect.top) / rect.height` với `rect = canvas.getBoundingClientRect()`.
5. Độ dày nét/cỡ chữ overlay nhân `k = canvas.width / rect.width` để luôn nhìn rõ trên màn nhỏ.
6. Video xoay (quay dọc từ điện thoại): chuẩn hoá trước bằng ffmpeg (mục 12.2). App giả định `videoWidth/Height` đã là hướng hiển thị.

---

## 6. Data contract — `src/types.ts`

```ts
export type Calib = {
  heightM: number;     // chiều cao ống kính so với mặt đường (m)
  vfovDeg: number;     // góc nhìn dọc của video (độ)
  horizonY: number;    // vị trí đường chân trời, normalized 0..1
  confirmed: boolean;  // false → không hiển thị khoảng cách
};

export type Det = {
  x: number; y: number; w: number; h: number; // video px
  label: string;                              // 'car' | 'truck' | 'bus' | 'motorcycle'
  score: number;                              // 0..1
};

export type Status =
  | 'loading' | 'model-error' | 'no-video' | 'uncalibrated' | 'no-vehicle'
  | 'no-lead' | 'too-close' | 'above-horizon' | 'out-of-range' | 'ok';

export type Frame = {
  dets: Det[];               // mọi xe sau khi lọc
  lead: Det | null;          // xe dẫn đầu (nếu có)
  distanceM: number | null;  // đã làm mượt; null khi status !== 'ok'
  status: Status;
  inferMs: number;           // median 15 lần detect gần nhất
  detectHz: number;          // số lần detect trong 1000 ms gần nhất
};

export type Delegate = 'GPU' | 'CPU';
```

---

## 7. Trạng thái

### 7.1 Thứ tự ưu tiên

Hàm thuần `resolveStatus()` trả về **trạng thái đầu tiên thoả điều kiện**:

| # | Status | Điều kiện | Box có vẽ? |
|---|---|---|---|
| 1 | `loading` | Detector chưa sẵn sàng | Không |
| 2 | `model-error` | Khởi tạo detector thất bại (cả GPU lẫn CPU) | Không |
| 3 | `no-video` | Chưa có nguồn video hoặc chưa `loadeddata` | Không |
| 4 | `uncalibrated` | `calib.confirmed === false` | **Có** (detect vẫn chạy thật) |
| 5 | `no-vehicle` | `dets.length === 0` | — |
| 6 | `no-lead` | Không box nào có tâm-đáy nằm trong ROI | Có (màu phụ) |
| 7 | `too-close` | `lead.y + lead.h >= videoHeight * BOTTOM_CLIP_RATIO` | Có |
| 8 | `above-horizon` | `groundDistance(...) === null` | Có |
| 9 | `out-of-range` | `distance > MAX_RANGE_M` | Có |
| 10 | `ok` | Còn lại | Có (màu chính + nhãn mét) |

### 7.2 Nội dung hiển thị

| Status | Tiêu đề lớn | Dòng phụ | Tone |
|---|---|---|---|
| `loading` | Đang tải mô hình… | Mô hình chạy trên thiết bị, không cần mạng | neutral |
| `model-error` | Không tải được mô hình | `{error.message}` + nút **Thử lại** | danger |
| `no-video` | Chưa có video | Tải lên MP4 hoặc chọn clip mẫu | neutral |
| `uncalibrated` | Chưa hiệu chuẩn | Nhập chiều cao camera, góc nhìn và căn đường chân trời | warn |
| `no-vehicle` | Không phát hiện xe | — | neutral |
| `no-lead` | Không có xe phía trước | Có `{n}` xe ngoài vùng phía trước | neutral |
| `too-close` | Quá gần | Đáy xe ra ngoài khung hình, không ước lượng được | warn |
| `above-horizon` | Không tính được | Đáy xe ở trên đường chân trời — kiểm tra hiệu chuẩn | warn |
| `out-of-range` | > 50 m | Ngoài tầm đo tin cậy | neutral |
| `ok` | `{d} m` | Xe trong vùng phía trước · `{label}` `{score%}` | ok |

- Định dạng số: `d < 20` → làm tròn 0.5 m, 1 chữ số thập phân (`12.5 m`); `d ≥ 20` → làm tròn 1 m (`27 m`).
- Tiêu đề trạng thái đặt trong vùng `aria-live="polite"`; **con số mét không** đặt trong aria-live (tránh đọc 15 lần/giây).

---

## 8. Module spec

### 8.1 `src/config.ts`

> `config.ts` **không** dùng `import.meta.env` (Node test sẽ crash). `MODEL_PATH`/`WASM_PATH` đặt trong `detector.ts`. `CALIB_DEFAULT` và `DEMO_CALIB` là export riêng, kiểu `Calib`.

```ts
export const CONFIG = {
  VEHICLE_LABELS: ['car', 'truck', 'bus', 'motorcycle'],
  SCORE_THRESHOLD: 0.35,
  MAX_RESULTS: 10,

  DETECT_MIN_INTERVAL_MS: 66,   // trần ~15 Hz
  INFER_WINDOW: 15,             // số mẫu để lấy median inferMs

  ROI_TOP_HALF_W: 0.04,         // nửa bề ngang cạnh trên (normalized), ngay dưới chân trời
  ROI_BOTTOM_HALF_W: 0.30,      // nửa bề ngang cạnh dưới, tại yN = 1
  ROI_CENTER_X: 0.5,

  LEAD_IOU_KEEP: 0.3,           // SHOULD: giữ xe cũ nếu IoU > ngưỡng
  LEAD_KEEP_MARGIN_Y: 0.03,     // ...và đáy chênh với xe gần nhất < 3% chiều cao ảnh

  EMA_ALPHA: 0.3,
  EMA_RESET_MS: 500,            // mất lead quá lâu → reset EMA

  BOTTOM_CLIP_RATIO: 0.98,
  MIN_RAY_ANGLE_DEG: 0.5,
  MAX_RANGE_M: 50,

  CALIB_LIMITS: { heightM: [0.5, 3], vfovDeg: [20, 120], horizonY: [0.05, 0.95] },
  CALIB_DEFAULT: { heightM: 1.3, vfovDeg: 41, horizonY: 0.45, confirmed: false },
} as const;
```

`CALIB_DEFAULT.confirmed = false` → giá trị mặc định chỉ là điểm bắt đầu cho slider, **không bao giờ** sinh ra số mét cho tới khi người dùng xác nhận.

### 8.2 `src/geometry.ts` (thuần, có test)

#### `groundDistance(yPx, imgH, calib): number | null`

```
fy    = (imgH / 2) / tan(vfov / 2)
cy    = imgH / 2
pitch = atan((cy − horizonY·imgH) / fy)        // > 0: camera chúi xuống
angle = pitch + atan((yPx − cy) / fy)          // góc tia so với phương ngang
angle < MIN_RAY_ANGLE  →  null
d     = heightM / tan(angle)
```

```ts
const RAD = Math.PI / 180;
export function groundDistance(yPx: number, imgH: number, c: Calib): number | null {
  const fy = imgH / 2 / Math.tan((c.vfovDeg * RAD) / 2);
  const cy = imgH / 2;
  const pitch = Math.atan((cy - c.horizonY * imgH) / fy);
  const angle = pitch + Math.atan((yPx - cy) / fy);
  if (angle < CONFIG.MIN_RAY_ANGLE_DEG * RAD) return null;
  return c.heightM / Math.tan(angle);
}
```

#### `inRoi(xN, yN, horizonY): boolean`

Hình thang neo theo chân trời: cạnh trên tại `yN = horizonY`, cạnh dưới tại `yN = 1`.

```
yN <= horizonY → false
t     = (yN − horizonY) / (1 − horizonY)                     // 0 → 1
halfW = ROI_TOP_HALF_W + t · (ROI_BOTTOM_HALF_W − ROI_TOP_HALF_W)
return |xN − ROI_CENTER_X| <= halfW
```

#### `roiPolygon(horizonY): [number, number][]`

Trả 4 đỉnh normalized (trên-trái, trên-phải, dưới-phải, dưới-trái) để vẽ — dùng chung hằng số với `inRoi`.

#### `pickLead(dets, prev, W, H, horizonY): Det | null`

1. Với mỗi `d`: `xN = (d.x + d.w/2)/W`, `yN = (d.y + d.h)/H`. Giữ những `d` có `inRoi(xN, yN, horizonY)`.
2. Rỗng → `null`.
3. `nearest` = ứng viên có `yN` lớn nhất (đáy thấp nhất ⇒ gần nhất).
4. *(SHOULD)* Nếu `prev` khác null và có ứng viên `m` với `iou(m, prev) > LEAD_IOU_KEEP` và `yN(nearest) − yN(m) < LEAD_KEEP_MARGIN_Y` → trả `m`. (Xe khác cắt vào gần hơn rõ rệt vẫn được chọn.)
5. Ngược lại → `nearest`.

#### `iou(a, b): number` — chuẩn, trả 0 khi không giao.

#### `ema(prev, next, alpha): number` — `prev === null ? next : prev + alpha·(next − prev)`.

#### `resolveStatus(input): Status` — đúng bảng 7.1. Input:
```ts
{ ready: boolean; error: boolean; hasVideo: boolean; calib: Calib;
  dets: Det[]; lead: Det | null; rawDistance: number | null; imgH: number }
```

#### `formatDistance(d): string` — quy tắc làm tròn mục 7.2.

### 8.3 `src/geometry.test.ts` — test tối thiểu (MUST)

| Hàm | Ca | Kỳ vọng |
|---|---|---|
| `groundDistance` | `h=1.5, vfov=90, horizon=0.5, imgH=1000, y=550` | `15` (±1e-9) |
| | `y=1000` | `1.5` |
| | `y=500` (đúng chân trời) | `null` |
| | `horizon=0.4, y=400` (chân trời khi camera chúi) | `null` |
| `inRoi` | `(0.5, 0.9, 0.45)` | `true` |
| | `(0.05, 0.9, 0.45)` | `false` |
| | `(0.5, 0.40, 0.45)` (trên chân trời) | `false` |
| `pickLead` | 2 box trong ROI, đáy 0.7 và 0.9 | box đáy 0.9 |
| | 1 box ngoài ROI | `null` |
| `resolveStatus` | `confirmed=false`, có dets | `'uncalibrated'` |
| | lead chạm đáy ảnh | `'too-close'` |
| | `rawDistance = 80` | `'out-of-range'` |
| `formatDistance` | `12.34`, `27.6` | `'12.5 m'`, `'28 m'` |

Chạy: `npm test`. Phải xanh trước khi nối vào UI (M3).

### 8.4 `src/detector.ts`

```ts
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

export async function createDetector(): Promise<{ detector: ObjectDetector; delegate: Delegate }> {
  const vision = await FilesetResolver.forVisionTasks(CONFIG.WASM_PATH);
  const make = (delegate: Delegate) => ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: CONFIG.MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    scoreThreshold: CONFIG.SCORE_THRESHOLD,
    maxResults: CONFIG.MAX_RESULTS,
    categoryAllowlist: [...CONFIG.VEHICLE_LABELS],
  });
  try { return { detector: await make('GPU'), delegate: 'GPU' }; }
  catch { return { detector: await make('CPU'), delegate: 'CPU' }; }
}

export function toDets(result: ObjectDetectorResult): Det[]  // map boundingBox.originX/Y/width/height + categories[0]
```

- Lỗi ở cả hai delegate → ném lên; `App` chuyển `model-error`, nút **Thử lại** gọi lại `createDetector()`.
- Unmount → `detector.close()`.
- Ghi `delegate` thực tế để hiển thị (GPU/CPU).

### 8.5 `src/Viewport.tsx` — vòng lặp

**Props:** `src: string | MediaStream | null`, `detector`, `calib`, `onFrame(frame: Frame)`, `onHorizonDrag(yN)` *(SHOULD)*.

**Phần tử:** `<video muted playsInline loop hidden>` + `<canvas>` hiển thị.

**Vòng lặp** (dùng `video.requestVideoFrameCallback`; nếu không có → `requestAnimationFrame`):

```
onVideoFrame(now):
  ctx.drawImage(video, 0, 0)
  if detector && now − lastDetectAt ≥ DETECT_MIN_INTERVAL_MS:
      t0 = performance.now()
      result = detector.detectForVideo(video, t0)      // timestamp luôn tăng — KHÔNG dùng video.currentTime
      inferSamples.push(performance.now() − t0)
      detectTimes.push(t0); lastDetectAt = now
      dets = toDets(result)
      lead = pickLead(dets, prevLead, W, H); prevLead = lead
      raw  = lead ? groundDistance(lead.y + lead.h, H, calib) : null
      status = resolveStatus(...)
      smoothed = status === 'ok' ? ema(smoothed, raw) : smoothed
      nếu status !== 'ok' liên tục > EMA_RESET_MS hoặc lead đổi (IoU ≤ ngưỡng) → smoothed = null
      onFrame({ dets, lead, distanceM: status==='ok' ? smoothed : null, status, inferMs: median(inferSamples), detectHz })
  drawOverlay(ctx, lastFrame, calib)
  schedule next
```

- State nóng (samples, prevLead, smoothed, lastFrame) giữ trong `useRef`; chỉ gọi `onFrame` (→ React state) ở nhịp detect (≤ 15 Hz).
- `calib` đọc qua ref để vòng lặp không phải khởi động lại khi kéo slider.
- Khi **pause/seek**: `requestVideoFrameCallback` không bắn → nghe `seeked` và `pause` để vẽ lại + detect 1 lần cho frame hiện tại.
- Đổi nguồn: `URL.revokeObjectURL` nguồn cũ, reset mọi ref.

**Overlay (`drawOverlay`)** — thứ tự vẽ:
1. ROI: đa giác `roiPolygon(horizonY)`, fill accent 12% opacity, viền accent 60%.
2. Đường chân trời: nét đứt ngang toàn khung tại `horizonY·H`, nhãn nhỏ "chân trời".
3. Box không phải lead: viền xám 1.5k px.
4. Lead: viền theo tone status 3k px + điểm tâm-đáy (chấm tròn) + nhãn `formatDistance(d)` phía trên box (chỉ khi `ok`).

### 8.6 `src/App.tsx`

Giữ state: `detectorState {status: 'loading'|'ready'|'error', delegate, error?}`, `src`, `calib`, `frame`, `sheetOpen`, `playing`.

**Nguồn video (MUST):**
- `<input type="file" accept="video/mp4,video/*">` → `URL.createObjectURL(file)`.
- Nút chọn clip mẫu: `drive.mp4`, `static.mp4` (đường dẫn `${BASE_URL}demo/...`).
- Nút Play/Pause.

**Camera trực tiếp (COULD):**
- Chỉ hiện nút khi `window.isSecureContext && navigator.mediaDevices?.getUserMedia`.
- `getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })` → gán `video.srcObject`.
- Từ chối quyền / lỗi → toast "Không truy cập được camera" + giữ nguồn cũ.
- Điện thoại qua LAN cần HTTPS: thêm `@vitejs/plugin-basic-ssl` **chỉ khi làm tính năng này**.

**Calibration sheet (MUST)** — bottom sheet trên mobile, panel bên phải trên desktop:

| Trường | Control | Giới hạn | Bước |
|---|---|---|---|
| Chiều cao camera | number input + đơn vị m | 0.5 – 3 | 0.01 |
| Góc nhìn dọc (vFOV) | number input + đơn vị ° | 20 – 120 | 0.5 |
| Đường chân trời | range slider (dọc theo % chiều cao) | 0.05 – 0.95 | 0.001 |
| Xác nhận | nút **"Dùng hiệu chuẩn này"** → `confirmed = true` | | |
| Preset *(SHOULD)* | nút **"Preset clip mẫu"** | chỉ hiện khi `DEMO_CALIB !== null` | |

- Bất kỳ thay đổi nào ở 3 trường **không** tự reset `confirmed` (cho phép tinh chỉnh live), nhưng nút **"Đặt lại"** đưa về `CALIB_DEFAULT` (`confirmed=false`).
- Giá trị ngoài giới hạn → clamp + viền đỏ, không nhận `NaN`.
- Gợi ý dưới trường vFOV: *"≈ 2·atan(9.7 / f₃₅) với f₃₅ là tiêu cự tương đương 35 mm của camera (VD 26 mm → ~41°), video 16:9 quay ngang."*
- Lưu `calib` vào `localStorage` (bọc `try/catch`; lỗi thì bỏ qua).

**Preset (SHOULD):** trong `config.ts`:
```ts
// Điền từ số đo thực tế ở mục 12. null = chưa đo → nút preset bị ẩn.
export const DEMO_CALIB: Calib | null = null;
```
Không được điền số đoán.

**Kéo chân trời trên canvas (SHOULD):** pointer down gần đường chân trời (±4% chiều cao) → kéo theo `yN`, clamp theo giới hạn; dùng Pointer Events để chạy cả chuột lẫn cảm ứng; `touch-action: none` trên canvas khi đang kéo.

---

## 9. UI spec

### 9.1 Bố cục mobile (390 × 844)

```
┌──────────────────────────────┐
│ SafeLens        ● GPU  ⦿ Off │  TopBar: tên · delegate · badge "On-device"
├──────────────────────────────┤
│                              │
│   CANVAS 16:9 (full width)   │  Viewport
│                              │
├──────────────────────────────┤
│  12.5 m                      │  DistanceCard: số cực lớn (56px, tabular-nums)
│  Xe trong vùng phía trước    │  dòng phụ theo bảng 7.2
├──────────────────────────────┤
│ 18 ms │ 14 Hz │ 3 xe │ 720p  │  MetricsRow
├──────────────────────────────┤
│ [⬆ Tải MP4] [Clip mẫu ▾] [▶] │  SourceBar
│ [⚙ Hiệu chuẩn]               │
└──────────────────────────────┘
```

- Gutter ngang 16 px; không cuộn ngang; vùng chạm tối thiểu 44×44 px.
- Desktop ≥ 1024 px: 2 cột — trái Viewport + DistanceCard, phải MetricsRow + SourceBar + Calibration panel luôn mở; nội dung `max-width: 1200px` canh giữa.

### 9.2 Design tokens (`index.css`, dark mặc định)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--bg` | `#0b0f14` | nền |
| `--surface` | `#141a22` | card |
| `--border` | `#243040` | viền |
| `--text` | `#e6edf3` | chữ chính |
| `--muted` | `#8b98a8` | chữ phụ |
| `--accent` | `#3ba7ff` | ROI, nút chính |
| `--ok` | `#22c55e` | lead khi `ok` |
| `--warn` | `#f5b400` | `uncalibrated`, `too-close`, `above-horizon` |
| `--danger` | `#ef4444` | `model-error` |

- Font: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; số dùng `font-variant-numeric: tabular-nums`.
- Tương phản chữ ≥ 4.5:1 trên `--surface`.

### 9.3 Component

| Component | Nội dung | Ghi chú |
|---|---|---|
| `TopBar` | "SafeLens", chip delegate (`GPU`/`CPU`/`—`), badge "On-device" khi detector `ready` | |
| `DistanceCard` | Tiêu đề + dòng phụ theo bảng 7.2, viền trái màu theo tone | Số chỉ hiện khi `ok`/`out-of-range` |
| `MetricsRow` | `inferMs` (ms, 0 chữ số), `detectHz`, số xe, độ phân giải video | Hiện `—` khi chưa có dữ liệu; **không** hardcode |
| `SourceBar` | Upload, chọn clip mẫu, Play/Pause, (COULD) Camera | |
| `CalibrationSheet` | Mục 8.6 | `role="dialog"`, đóng bằng Esc / nút ✕ |
| `ErrorPanel` | Thông điệp + nút Thử lại | trong `DistanceCard` khi `model-error` |

Đây đều có thể là hàm trong `App.tsx`; chỉ tách file khi `App.tsx` > ~300 dòng.

---

## 10. Hiệu năng

- Trần detect: `DETECT_MIN_INTERVAL_MS = 66` (~15 Hz). Nếu `inferMs > 66`, nhịp tự giảm vì `detectForVideo` đồng bộ — **chấp nhận**, hiển thị đúng Hz đo được.
- Render canvas chạy theo frame video; overlay giữa hai lần detect dùng kết quả gần nhất (trễ ≤ 1 chu kỳ detect — giới hạn đã biết).
- Clip mẫu chuẩn hoá 1280 px chiều ngang (mục 12.2) để giảm tải decode.
- `inferMs` = median 15 mẫu; `detectHz` = số timestamp trong cửa sổ 1000 ms. Cả hai tính từ `performance.now()`.
- Mục tiêu tham khảo (không cam kết, báo cáo số thật): laptop có GPU tích hợp ≥ 10 Hz.

---

## 11. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| WASM/model 404 hoặc lỗi khởi tạo | Thử CPU; vẫn lỗi → `model-error` + thông điệp + Thử lại |
| `detectForVideo` ném lỗi giữa chừng | Bắt lỗi, `console.error`, bỏ frame đó, vòng lặp tiếp tục; lỗi liên tiếp > 10 lần → `model-error` |
| File không phát được (`video.onerror`) | Toast "Không phát được video này — thử MP4 H.264", giữ nguồn cũ |
| `videoWidth === 0` | Coi như `no-video` |
| Input hiệu chuẩn không hợp lệ | Clamp, viền đỏ, không nhận `NaN` |
| `localStorage` lỗi | Bỏ qua, dùng `CALIB_DEFAULT` |
| Camera bị từ chối (COULD) | Toast, giữ nguồn cũ |

---

## 12. Dữ liệu test & hiệu chuẩn

### 12.1 Quay clip

- Điện thoại **ngang**, giá cố định, camera chính 1×, 1080p 30 fps, **tắt chống rung**.
- **Không chạm giá điện thoại giữa các clip** — một bộ hiệu chuẩn dùng cho tất cả.
- Đo `heightM` = ống kính → mặt đất (thước dây).
- `static.mp4`: xe đứng yên trên bãi phẳng, xe phía trước tại **5 / 10 / 15 / 20 m** (đo từ hình chiếu ống kính tới cản sau xe trước), mỗi mốc ~5 s.
- `drive.mp4`: 30–60 s, ban ngày, đường thẳng, có xe phía trước. Người ngồi ghế phụ quay; tài xế không thao tác điện thoại.

### 12.2 Chuẩn hoá

```bash
ffmpeg -i in.mov -vf "scale=1280:-2" -c:v libx264 -crf 23 -an -movflags +faststart public/demo/drive.mp4
```
(ffmpeg tự áp metadata xoay khi encode.)

### 12.3 Quy trình hiệu chuẩn

1. Nhập `heightM` đo được, `vfovDeg` từ công thức `2·atan(9.7 / f₃₅)`.
2. Mở `static.mp4`, dừng ở mốc **10 m**, kéo chân trời tới khi app đọc 10 m → xác nhận → ghi giá trị vào `DEMO_CALIB`.
3. Mốc **5 / 15 / 20 m chỉ dùng kiểm chứng** — không chỉnh thêm.

### 12.4 Bảng kiểm chứng (điền sau M4)

| Mốc thật (m) | Ước tính (m) | Sai số (m) | Sai số (%) |
|---|---|---|---|
| 5 | | | |
| 10 *(dùng để hiệu chuẩn)* | | | |
| 15 | | | |
| 20 | | | |

Kèm: thiết bị/trình duyệt, delegate, `inferMs`, `detectHz` đo được.

---

## 13. Milestone & gate (≤ 75 phút)

Mỗi milestone: code xong → kiểm tra theo tiêu chí → `git commit`. Trượt gate → áp dụng cột "Nếu trễ".

| M | Phút | Nội dung | Tiêu chí hoàn thành | Nếu trễ |
|---|---|---|---|---|
| **M0** | 0–5 | Chốt `types.ts`, `config.ts` | File tồn tại, build được | — |
| **M1** | 5–15 | Scaffold, Tailwind, asset local, `createDetector()` | Tắt Wi-Fi → reload → console log `ready` + delegate | Phút 25: ép CPU. Phút 30: tạm `WASM_PATH` = jsDelivr `@mediapipe/tasks-vision@1.1.1/wasm`, ghi nhận mất offline |
| **M2** | 15–35 | Nguồn video, vòng lặp, `drawOverlay` (box), metrics | Trên `drive.mp4` thật: box ôm sát xe ở cả mép trái/phải/dưới; `inferMs`, `detectHz` hiện số thật; loop video không lỗi timestamp | Phút 45: bỏ hết SHOULD, mọi người dồn vào pipeline |
| **M3** | 35–55 | `geometry.ts` + test, ROI, lead, EMA, `resolveStatus`, calibration sheet | `npm test` xanh; đủ 10 trạng thái tái hiện được; `static.mp4` hiệu chuẩn ở 10 m đọc được 5/15/20 m | Phút 65: bỏ SHOULD; ghi "chưa kiểm chứng định lượng" |
| **M4** | 55–70 | UI 390 px + desktop, SHOULD (hysteresis, kéo chân trời, preset) | Checklist mục 14 đạt | Cắt SHOULD theo thứ tự: kéo chân trời → hysteresis → preset |
| **M5** | 70–75 | **Freeze** | `npm run build && npm run preview` chạy; test offline lại; `git tag demo-v1`; grep không còn `mock` | Freeze bất kể trạng thái |

**Song song nếu có 2–3 người:** A làm `detector.ts` + `Viewport.tsx` + `geometry.ts`; B làm `App.tsx` + UI với `Frame` giả **chỉ trong lúc dựng** (xoá trước M5); C quay & chuẩn hoá clip (giao `public/demo/*` trước phút 35) rồi điền bảng 12.4.

---

## 14. Kiểm thử chấp nhận (thủ công)

**Pipeline**
- [ ] Tắt Wi-Fi, reload: model load, trạng thái `no-video`.
- [ ] `drive.mp4`: box khớp xe; resize cửa sổ/xoay màn hình box vẫn khớp.
- [ ] Video loop qua đầu clip nhiều lần không lỗi.
- [ ] Pause + tua: canvas và box cập nhật đúng frame đang dừng.
- [ ] Chip delegate hiện đúng (ép CPU bằng cách đổi code tạm → hiện `CPU`).

**Khoảng cách & trạng thái**
- [ ] Chưa xác nhận hiệu chuẩn: box vẫn vẽ, **không có số mét**, hiện "Chưa hiệu chuẩn".
- [ ] Kéo chân trời xuống dưới đáy xe → `above-horizon`.
- [ ] Xe sát camera (đáy ra ngoài khung) → `too-close`.
- [ ] Xe chỉ ở làn bên → `no-lead`.
- [ ] Đoạn không có xe → `no-vehicle`.
- [ ] Số mét không nhảy quá ~1 m giữa các lần cập nhật khi xe đứng yên ở 10 m.
- [ ] Bảng 12.4 có số thật.

**UI**
- [ ] 390 px: không cuộn ngang, mọi nút ≥ 44 px, chữ đọc được.
- [ ] Desktop 1440 px: bố cục 2 cột.
- [ ] Bàn phím: Tab tới mọi control; Esc đóng calibration sheet.
- [ ] Đổi giá trị ngoài giới hạn → clamp, không `NaN`.

---

## 15. Definition of Done

1. Mọi mục **MUST** ở 1.2 hoạt động; `npm test` xanh; `npm run build` không lỗi TypeScript.
2. Mọi mục ở checklist 14 đạt (hoặc ghi rõ lý do không đạt).
3. Không có giá trị giả/hardcode nào xuất hiện như kết quả AI (grep `mock`, `fake`, `TODO` trước freeze).
4. Chạy offline từ bản build (`npm run preview`).
5. Tag `demo-v1` đã push.
