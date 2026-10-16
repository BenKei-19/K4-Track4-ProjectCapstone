# Original User Request

## 2026-10-16T08:05:48Z

# DriveDeck xADAS (Forward Collision Warning & Distance Estimation HUD)

Requested team: Team review & implementation (Automotive HUD Engineer, ADAS Vision Engineer, QA & Reviewer)

Xây dựng ứng dụng Web hoàn chỉnh bằng React + TypeScript + Vite + Tailwind CSS + Lucide Icons mô phỏng hệ thống hỗ trợ lái xe DriveDeck xADAS (Forward Collision Warning & Distance Estimation HUD) chạy trên nền video YouTube / MP4 với AI vehicle detection và thuật toán Dual-Pinhole Fusion thời gian thực.

Working directory: d:/K4-Track4-ProjectCapstone
Integrity mode: demo

## Requirements

### R1. Background Video Layer & Audio Synthesizer
- Nhúng video YouTube (hỗ trợ nhập URL / Video ID, tự động lặp, tắt tiếng mặc định, ẩn controls) và hỗ trợ tải file video MP4 từ máy.
- Có sẵn 3 preset link YouTube dashcam (cao tốc ban ngày, đô thị, ban đêm/mưa).
- Bộ tổng hợp âm thanh cảnh báo ô tô bằng Web Audio API thuần (không dùng file âm thanh ngoài): bíp nhẹ ngắt quãng khi cảnh báo (vàng 12m-25m), bíp kép tần số cao liên tục khi nguy hiểm (<12m) kèm hiệu ứng viền chớp đỏ (Red Vignette Pulse). Có nút bật/tắt âm thanh.

### R2. HUD Visual Layer (DriveDeck xADAS Styling)
- **Telemetry HUD (Góc trên bên trái, Glassmorphism):**
  - Alert Badge: "KHOẢNG CÁCH AN TOÀN" (>25m, xanh #10B981), "CHÚ Ý GIỮ KHOẢNG CÁCH" (12m-25m, cam #F59E0B), "GẦN HƠN QUY ĐỊNH" (<12m, đỏ nhấp nháy #EF4444).
  - Số đo khoảng cách cỡ lớn (`text-6xl`/`7xl`, `font-extrabold`, `tabular-nums`) kèm sai số bất định `± 1.4 m`. Màu chữ chuyển động mượt Xanh - Cam - Đỏ.
  - Vận tốc & khoảng cách tối thiểu (quy tắc 2 giây): `64 km/h • Tối thiểu 32 m`.
- **Dynamic SVG Lane Carpet (Phối cảnh 3D):**
  - Thảm làn đường hình thang phát sáng chuyển màu theo khoảng cách an toàn, cho phép kéo/tinh chỉnh đường chân trời (Horizon Y, Lane Width).
- **Lead Vehicle Target Lock:**
  - Khung Bounding Box ADAS khóa bám dưới gầm xe trước, tự động co giãn kích thước & vị trí Y theo công thức phối cảnh Pinhole ngược từ khoảng cách Z thực tế.
  - Tag xe mục tiêu: `Lead Car • [Z]m • TTC: [X.X]s`.
- **BEV Radar & Distance History (Góc phải):**
  - Mini 2D Bird's-Eye View radar có vạch 10m, 20m, 40m.
  - Sparkline thời gian thực vẽ biến thiên khoảng cách trong 15 giây gần nhất.

### R3. Dual-Pinhole Fusion & Kalman Filter Math Engine
- Triển khai đầy đủ mô hình toán học 3 tầng:
  1. Ground Contact Pinhole: Z_y = (f_y * H_cam) / ((y_max - c_y) + f_y * tan(pitch_rad))
  2. Vehicle Width Pinhole: Z_w = (f_x * W_car) / (x_max - x_min) (W_car = 1.82 m)
  3. Weighted Fusion: Z_raw = w_y * Z_y + w_w * Z_w (mặc định w_y = 0.65, w_w = 0.35, tự thích ứng theo confidence)
  4. 1D Kalman / EMA Filter: Z_filtered = K_gain * Z_raw + (1 - K_gain) * Z_prev (K_gain mặc định 0.25)
  5. Time-To-Collision: TTC = Z_filtered / max(0.1, v_ego - v_lead)

### R4. Calculation Weights & Telemetry Box (Inspector Panel Góc trên bên phải)
- Bảng Glassmorphism chuyên nghiệp có thể thu gọn / mở rộng gồm 4 phân khu cập nhật 60 FPS:
  1. `[AI DETECTION ENGINE]`: Model selector (`YOLOv8n-KITTI` vs `COCO-SSD`), Confidence progress bar, raw bbox `[x1, y1, x2, y2]`, điểm chạm đất `v_bottom`, bề rộng `w_px`.
  2. `[CAMERA CALIBRATION MATRIX]`: Ma trận f_y = 721.5 px, c_y = 185.0 px, H_cam = 1.65 m, Pitch theta = 0.5 deg, W_car = 1.82 m.
  3. `[FUSION & FILTER WEIGHTS]`: Thanh trượt tương tác thay đổi trực tiếp w_y, K_gain, f_y, H_cam làm thay đổi tức thì kết quả đo trên HUD.
  4. `[LIVE PIPELINE FORMULA OUTPUT]`: Hiển thị rõ các giá trị từng bước Z_y, Z_w, Z_raw, Z_kalman, TTC.

### R5. Director Panel & 3 Operating Modes
- Khay điều khiển ở cạnh dưới (phím tắt `H` để ẩn/hiện hoàn toàn cho trình chiếu):
  - Chế độ 1: Auto Simulation (nội suy mượt 60 FPS kèm nhiễu động học thực tế).
  - Chế độ 2: Scenario Presets ("Cruising An toàn 40m", "Phanh gấp 40m -> 8m", "Xe cắt mặt 10m", "Bám đuôi cao tốc 15m").
  - Chế độ 3: Manual Live Control (phím mũi tên Lên/Xuống chỉnh khoảng cách, Trái/Phải chỉnh vị trí lệch làn theo diễn biến video).
- Tích hợp AI Vehicle Detection trên canvas/video MP4 với fallback mô phỏng mượt mà khi chạy YouTube IFrame.

## Acceptance Criteria

### Build & Code Integrity
- [ ] Lệnh `npm run build` biên dịch thành công 100% không có bất kỳ lỗi TypeScript hay CSS nào.
- [ ] Ứng dụng khởi động mượt mà với `npm run dev` trên trình duyệt.

### UI & Interaction
- [ ] Bấm phím `H` ẩn/hiện mượt mà bảng Director Panel.
- [ ] Phím mũi tên Lên/Xuống/Trái/Phải điều khiển vị trí xe trong chế độ Manual Live Control.
- [ ] Giao diện HUD đạt chuẩn Glassmorphism trong suốt, các layer video, lane carpet, bounding box và telemetry lồng ghép chuẩn xác.

### Mathematical Correctness & Synchronicity
- [ ] Khoảng cách trên HUD góc trái đồng bộ tuyệt đối với Z_kalman trong Telemetry Box góc phải.
- [ ] Kéo thanh trượt K_gain làm thay đổi độ mượt/độ trễ lọc số đo; kéo w_y thay đổi tỷ trọng giữa điểm đáy và bề rộng xe.
- [ ] Âm thanh cảnh báo Web Audio phát chuẩn xác theo 3 ngưỡng (Xanh: im lặng, Vàng: bíp ngắt quãng, Đỏ: bíp kép dồn dập + viền chớp đỏ).
