# ART-vis (Autonomous Rail Transit Visualizer)

Aplikasi berbasis web interaktif untuk memvisualisasikan dan menghitung dinamika pergerakan **Autonomous Rail Rapid Transit (ART)** di persimpangan jalan maupun tikungan. Aplikasi ini bertujuan membantu tata kota dan insinyur menganalisis apakah dimensi ART dan radius putarnya aman (tidak menabrak trotoar atau median jalan).

## 🚀 Fitur Utama

- **Simulasi 2D Real-time**: Animasi pergerakan ART (multi-gerbong) melintasi persimpangan dengan pergerakan kinematik (*All-Wheel Steering*).
- **Perhitungan Fisika & Sapuan Bodi (*Swept Path*)**: Menghitung radius putar minimum, *inner radius*, *outer radius*, dan lebar ruang sapuan (*swept width*) secara presisi.
- **Deteksi Tabrakan (*Collision Detection*) Cerdas**: Secara otomatis mendeteksi apakah bagian luar bodi kereta menabrak trotoar, atau bagian dalam menabrak median jalan.
- **Auto-Optimasi Radius**: Mencari target radius putar terkecil yang paling optimal agar kereta bisa berbelok dengan aman tanpa menyebabkan tabrakan.
- **Alat Ukur Jarak (*Ruler Mode*)**: Fitur penggaris interaktif di dalam kanvas untuk mengukur jarak dan dimensi dunia nyata (skala meter).
- **HUD & Analisis Deskriptif**: Menampilkan metrik utama secara detail, dilengkapi penjelasan rinci berbasis bahasa manusia mengenai kondisi persimpangan, tingkat keamanan, dan penjelasan masalah jika terjadi tabrakan.
- **Pengepasan (*Panning*) Kamera**: Kanvas simulasi bersifat interaktif dan bisa digeser (drag).
- **Perintah AI Sederhana (Chat Input)**: Mengubah pengaturan dimensi dan gerbong hanya dengan mengetik kalimat bahasa alami (contoh: *"pakai 4 gerbong dan radius 50 meter"*).
- **Elemen Lingkungan Ekstra**: Opsi untuk menampilkan mobil statis (sebagai pembanding skala ruang) dan simulasi perpapasan 2 kereta sekaligus.

---

## 🧮 Rumus dan Logika Perhitungan

Aplikasi ini menggunakan pendekatan geometri dan fisika kinematik yang dikhususkan untuk Autonomous Rail Transit. Sistem ART memprogram agar **semua poros roda (*axle*) dari semua gerbong melewati rute/jejak lingkar radius (`R`) yang sama persis**, tidak seperti bus gandeng konvensional yang menyapu lebih jauh ke dalam (*off-tracking*).

### 1. Radius Putar Fisik Minimum
Menghitung batas maksimum seberapa tajam roda kemudi bisa berbelok sebelum batas mekanis tercapai.
> **R_min = wheelbase / tan(maxSteeringAngle)**
- `wheelbase`: Jarak longitudinal antar sumbu roda depan dan roda belakang dalam satu gerbong.
- `maxSteeringAngle`: Sudut belok maksimal ban (dikonversi ke radian).

### 2. Radius Sapuan (*Swept Radii*)
Karena as roda depan dan belakang berada persis pada kurva lingkar radius `R`, bodi gerbong yang kaku (berbentuk balok) akan memotong kurva tersebut layaknya garis tali busur (*secant/chord*).
- **Jarak pusat belokan ke garis tengah bodi (`R_center`)**:
  > R_center = √(R² - (wheelbase / 2)²)
- **Radius Sapuan Dalam (*Inner Radius* / rInner)**: Berada pada "perut" atau titik tengah bodi bagian dalam gerbong.
  > rInner = R_center - (width / 2)
- **Radius Sapuan Luar (*Outer Radius* / rOuter)**: Berada pada titik terjauh (ujung depan dan ujung belakang pojok luar).
  > rOuter = √((length / 2)² + (R_center + width / 2)²)
- **Lebar Total Sapuan Bodi (*Swept Width*)**: Lebar lorong jalan aktual yang dibutuhkan saat manuver berlangsung.
  > Swept Width = rOuter - rInner

### 3. Logika Deteksi Tabrakan di Persimpangan
Aplikasi menggunakan sistem **Left-Hand Traffic (LHT)** (setir kanan, lalu lintas jalur kiri). Ketika ART berbelok dari lajur terdalam (dekat median):
- **Overshoot / Melenceng (Realistic Constraint)**: Kereta tidak dapat memulai belokan sebelum mencapai mulut persimpangan. Jika menggunakan target radius yang teramat besar, titik pusat lingkar (arc center) dipaksa bergeser, sehingga manuver kereta akan "melenceng" jauh dari lajur tujuan dan memakan lajur lain.
- **Benturan Luar (Outer Crashes)**: Dideteksi dengan membandingkan jarak pusat lengkung ke trotoar. Jika lebih kecil dari `rOuter`, maka kereta menggilas trotoar asal, sudut luar persimpangan, atau batas tepi lajur tujuan.
- **Benturan Dalam (Inner Crashes)**: Dideteksi dengan menghitung intersepsi kurva `rInner`. Terjadi jika perut gerbong membentur pembatas jalan (median).

---

## 🕹️ Cara Penggunaan

1. **Atur Parameter Kendaraan & Jalan**: Pada panel sisi kiri (*Sidebar*), Anda bisa menggeser *slider* pengaturan yang tersedia:
   - **Gerbong**: 3-5 gerbong.
   - **Dimensi Bodi**: Panjang, Lebar, *Wheelbase*, dan Sudut Kemudi Maksimal.
   - **Jalan & Lingkungan**: Ubah tipe persimpangan, total lebar jalan, ukuran lajur kereta, dan toleransi kelegaan ruang (*clearance*).
2. **Analisis Kelayakan (*Dashboard HUD*)**: 
   - Pantau status keamanan (**✅ AMAN** atau **❌ TIDAK AMAN**) di panel atas.
   - Jika terjadi tabrakan, baca ringkasan teks untuk mengetahui penyebab masalahnya secara pasti (misal: "Bodi luar naik ke trotoar sudut perempatan").
3. **Navigasi Visualisasi**: 
   - Klik tahan dan geser kursor di area kanvas untuk memindahkan kamera (*Panning*).
   - Pastikan untuk memperhatikan garis putus-putus merah (Jejak Sapuan Luar) dan biru (Jejak Sapuan Dalam).
4. **Mengukur Objek (*Ruler Mode*)**:
   - Klik tombol ikon kuning (Penggaris) di menu bawah kanvas.
   - Klik & tarik (*drag*) garis lurus dari satu titik ke titik lain pada kanvas untuk mengukur dimensi (dalam satuan meter) secara interaktif.
   - Matikan penggaris dengan menekan tombol icon yang sama untuk kembali ke mode Panning.
5. **Kontrol Pemutaran (*Playback*)**: Gunakan tombol **Play/Pause** dan **Reset** di bawah kanvas untuk memainkan, menghentikan, atau mengulang pergerakan animasi simulasi ART.
6. **Perintah Cepat AI**: Pada dasar *Sidebar*, ketik perintah instan menggunakan kalimat sehari-hari. 
   - *Contoh: "Ubah ke 5 gerbong dengan radius 60 meter dan lebar 3 lajur".*

## 🛠️ Stack Teknologi

- **Library & Framework**: React.js, Vite
- **Render Engine Visual**: HTML5 Canvas (`<canvas>` 2D API) dengan perhitungan Native JS Loop (`requestAnimationFrame`)
- **Styling**: Vanilla CSS, teknik antarmuka Glassmorphism (blur tembus pandang)
- **Icons**: Lucide-React
