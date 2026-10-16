# DriveDeck xADAS • Forward Collision Warning & Distance Estimation HUD

> Ứng dụng Web mô phỏng giao diện hệ thống hỗ trợ lái xe ADAS tiên tiến (**DriveDeck xADAS Style trên iPhone**) với AI Vehicle Detection, thuật toán **Dual-Pinhole Weighted Fusion** và bộ lọc **1D Kalman Filter** thời gian thực chạy trên nền video YouTube Dashcam hoặc MP4.

---

## 🚗 1. Các Tính năng Cốt lõi

### 1.1. Lớp Video Nền (Background Video Layer)
- Tích hợp **YouTube IFrame API**: Tự động phát, lặp lại vô tận, tắt tiếng mặc định, ẩn toàn bộ UI điều khiển của YouTube để tạo trải nghiệm Cockpit toàn màn hình.
- Có sẵn **3 preset video Dashcam**:
  - *Cao tốc ban ngày (Highway Cruise)*
  - *Đô thị mật độ cao (Urban Traffic)*
  - *Mưa & Đêm cao tốc (Night & Rain)*
- Hỗ trợ nhập bất kỳ **YouTube URL / Video ID** nào hoặc **Upload file `.mp4`** từ máy tính.
- Hiệu ứng viền **Vignette chớp đỏ (Danger Pulse)** khi xe rơi vào vùng nguy hiểm ($< 12\text{m}$).

### 1.2. Telemetry HUD Card (Góc trên bên trái)
- Thiết kế **Glassmorphism** chuẩn ô tô (`backdrop-blur-md bg-black/60 border border-white/10 rounded-2xl`).
- **Alert Badge:**
  - $> 25\text{m}$: `KHOẢNG CÁCH AN TOÀN` (Xanh `#10B981`)
  - $12\text{m} - 25\text{m}$: `CHÚ Ý GIỮ KHOẢNG CÁCH` (Cam `#F59E0B`)
  - $< 12\text{m}$: `GẦN HƠN QUY ĐỊNH` (Đỏ nhấp nháy `#EF4444`)
- **Số đo khoảng cách cực đại:** Phông số `text-7xl font-black tabular-nums` chuyển mượt màu sắc kèm sai số bất định $\pm \sigma\text{ m}$.
- **Quy tắc an toàn 2 giây:** Tự động tính khoảng cách an toàn tối thiểu theo vận tốc hiện tại: $d_{min} = v_{ego} \times \frac{2}{3.6}$ (Ví dụ: `68 km/h • Tối thiểu 38 m`).

### 1.3. Lớp phủ Làn đường 3D (Dynamic SVG Lane Carpet)
- Hình thang phối cảnh (trapezoid polygon) trải gradient từ chân cản trước vuốt nhọn về đường chân trời.
- Hai dải biên phát sáng (Glowing boundaries) đổi màu đồng bộ theo trạng thái an toàn.
- Cho phép kéo thanh trượt căn chỉnh toạ độ **Độ cao đường chân trời (Horizon Y)**, **Bề rộng đỉnh/đáy làn** và **Tâm làn đường** để khớp chuẩn xác góc camera của bất kỳ video dashcam nào.

### 1.4. Khóa mục tiêu Xe phía trước (Lead Vehicle Target Lock)
- Khung bracket ADAS góc cắt (sci-fi HUD) bám sát gầm sau xe mục tiêu.
- Kích thước chiều ngang ($w_{px}$) và vị trí trục tung ($y_{max}$) tự động co giãn theo phối cảnh ngược từ khoảng cách $Z$.
- Tag thông tin bám theo xe: `Lead Car • [Z]m • TTC: [X.X]s` cùng laser bar chạm đất $y_2$.

### 1.5. Mini Bird's-Eye View (BEV Radar) & Sparkline Lịch sử
- Radar 2D từ trên xuống: Xe Ego ở đáy, xe trước di chuyển lên/xuống theo thời gian thực, có các vạch cung cự ly $10\text{m}$, $20\text{m}$, $40\text{m}$ và đường quét radar xoay liên tục.
- Biểu đồ Sparkline thời gian thực ghi nhận biến thiên khoảng cách trong **15 giây gần nhất** với 2 đường ngưỡng đỏ ($12\text{m}$) và cam ($25\text{m}$).

### 1.6. Hệ thống Cảnh báo Âm thanh (Web Audio API Synthesizer)
- Tự động tổng hợp âm thanh cảnh báo ô tô từ `AudioContext` (không tải file MP3 ngoài):
  - **Vùng Cảnh báo (Vàng):** Tiếng bíp nhẹ ngắt quãng (850Hz, chu kỳ 850ms).
  - **Vùng Nguy hiểm (Đỏ $< 12\text{m}$):** Tiếng bíp kép tần số cao dồn dập (1900Hz + 2400Hz, chu kỳ 220ms).
  - Nút Mute / Unmute trên màn hình hoặc phím tắt `M`.

---

## 📐 2. Bảng Trọng số & Mô hình Toán học (Calculation Weights & Telemetry Box)

Bảng Inspector Glassmorphism ở góc trên bên phải hiển thị tường minh luồng tính toán 60 FPS:

### 2.1. Phương pháp 1: Ground Contact Pinhole ($Z_y$)
$$Z_y = \frac{f_y \cdot H_{cam}}{(y_{max} - c_y) + f_y \cdot \tan(\theta_{pitch})}$$
- $f_y$: Tiêu cự camera theo trục Y ($721.5\text{ px}$)
- $H_{cam}$: Chiều cao lắp camera so với mặt đường ($1.65\text{ m}$)
- $c_y$: Toạ độ tâm quang học ($185.0\text{ px}$)
- $\theta_{pitch}$: Góc nghiêng camera ($0.5^\circ$)
- $y_{max}$: Toạ độ điểm chạm đất của bánh sau xe mục tiêu

### 2.2. Phương pháp 2: Vehicle Width Pinhole ($Z_w$)
$$Z_w = \frac{f_x \cdot W_{car}}{x_{max} - x_{min}}$$
- $W_{car}$: Bề rộng tiêu chuẩn của ô tô du lịch ($1.82\text{ m}$)
- $w_{px} = x_{max} - x_{min}$: Chiều rộng bounding box xe mục tiêu trên ảnh

### 2.3. Hợp nhất Đa trọng số (Weighted Fusion)
$$Z_{raw} = w_y \cdot Z_y + w_w \cdot Z_w$$
- Mặc định: $w_y = 0.65$ và $w_w = 0.35$ ($w_y + w_w = 1.0$).
- Chế độ thích ứng thông minh: Tự động điều chỉnh $w_y$ và $w_w$ dựa theo độ tin cậy $W_{conf}$ của mô hình AI.

### 2.4. Bộ lọc 1D Kalman / EMA Filter
$$Z_{kalman} = K_{gain} \cdot Z_{raw} + (1 - K_{gain}) \cdot Z_{prev}$$
- $K_{gain}$ điều chỉnh từ $0.05$ (lọc cực đầm, chống nhiễu) đến $1.0$ (phản hồi tức thì, bám sát raw).

### 2.5. Time-To-Collision (TTC)
$$TTC = \frac{Z_{kalman}}{\max(0.1, v_{ego} - v_{lead})}$$

---

## 🎬 3. Bảng Điều khiển Demo "Director Panel" & Phím tắt

Bảng điều khiển dưới đáy màn hình phục vụ trình chiếu chuyên nghiệp:
- **Phím `H`:** Ẩn / Hiện toàn bộ bảng Director Panel để quay video hoặc thuyết trình thuần HUD.
- **Phím `M`:** Bật / Tắt âm thanh cảnh báo.
- **Phím `↑` / `↓`:** Tăng / Giảm khoảng cách xe mục tiêu (khi ở chế độ Manual).
- **Phím `←` / `→`:** Dịch chuyển xe mục tiêu sang trái / phải làn đường.

### 3 Chế độ Vận hành:
1. **Auto Sim (60 FPS):** Tự động mô phỏng di chuyển mượt mà với quán tính và vi nhiễu tự nhiên.
2. **Kịch bản (1-Click Presets):**
   - *Cruising An toàn ($40\text{m}$)*
   - *Phanh gấp ($40\text{m} \to 8\text{m}$)*: Cảnh báo đỏ dồn dập
   - *Xe cắt mặt ($10\text{m}$)*: Xe tạt đầu từ lề phải
   - *Bám đuôi cao tốc ($15\text{m}$)*: Cảnh báo chú ý giữ khoảng cách
3. **Manual Live:** Kéo slider hoặc dùng phím mũi tên để căn khoảng cách khớp chuẩn với xe đang chạy trong bất kỳ video dashcam nào.

---

## 🚀 4. Hướng dẫn Chạy Ứng dụng

```bash
# 1. Cài đặt các gói phụ thuộc (nếu chưa cài)
npm install

# 2. Chạy môi trường phát triển
npm run dev

# 3. Biên dịch bản đóng gói Production
npm run build
```

Mở trình duyệt truy cập: `http://localhost:5173` để trải nghiệm HUD.
