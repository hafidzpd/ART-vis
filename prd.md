Catatan yang sangat tajam! Kamu benar, PRD sebelumnya masih berupa **kalkulasi geometri statis** (hanya menghitung panjang dan lebar saat kereta sudah berada di tengah tikungan).

Di dunia nyata, pergerakan ART dipengaruhi oleh **Fisika dan Kinematika (pergerakan)**. Misalnya: ART tidak bisa tiba-tiba berbelok patah. Ada proses memutar setir, ada kecepatan (makin ngebut, radius harus makin besar agar penumpang tidak terlempar karena gaya sentrifugal), dan ART itu terdiri dari **beberapa gerbong yang tersambung (articulated)**, bukan satu kotak panjang.

Tapi tenang saja, seperti permintaanmu: **ujung-ujungnya aplikasi ini harus tetap bisa menjawab dengan bahasa manusia: *"Intinya butuh radius jalan berapa meter dan lebarnya berapa?"***

Berikut adalah **Update PRD (Versi 2.0 - Comprehensive Dynamic & Static)** yang memasukkan segala aspek namun tetap fokus pada hasil akhir (lebar jalan dan radius).

---

# Product Requirements Document (PRD) - Versi 2.0

**Nama Produk:** ART-Vis (Autonomous Rail Transit Swept Path & Dynamics Visualizer)
**Fokus Utama:** Menjawab "Berapa radius dan lebar jalan yang dibutuhkan?" secara visual dan matematis.

## 1. Pembaruan Konsep (Geometri + Dinamika Fisika)

Aplikasi tidak hanya menggambar kotak, tetapi mensimulasikan rangkaian gerbong yang bersambung (*articulated*). Aplikasi akan menghitung radius minimum **secara fisik (mentoknya roda)** dan radius minimum **secara operasional (berdasarkan kecepatan dan kenyamanan)**.

## 2. Kebutuhan Fungsional (Parameter yang Bisa di-Custom)

### A. Aspek Kendaraan (Vehicle Specs)

Pengguna bisa mengatur bentuk fisik kereta:

* **Jumlah Gerbong:** (Bisa di-set 3, 4, atau 5 gerbong. Standar ART biasanya 3 gerbong).
* **Dimensi per Gerbong:** Panjang, Lebar, dan Jarak Sumbu Roda (*Wheelbase*).
* **Posisi Engsel (Articulation Joint):** Jarak sambungan antar gerbong.
* **Max Steering Angle (Sudut Belok Roda Maksimal):** Seberapa patah roda bisa berbelok (misal: mentok di 35 derajat). *Angka inilah yang menentukan seberapa kecil radius jalan yang bisa dilewati secara fisik.*

### B. Aspek Dinamis & Lingkungan (Environment & Dynamics)

Pengguna bisa mengatur cara kereta berjalan:

* **Kecepatan Laju (Speed):** Input dalam km/jam. (Jika kecepatan dinaikkan, sistem akan menolak radius kecil dan memaksa kurva jalan membesar karena batas gaya sentrifugal).
* **Radius Jalan Target ($R_{out}$):** Seberapa besar perempatan/tikungan yang ada di lokasi.
* **Clearance (Jarak Aman Margin):** Jarak toleransi dari trotoar/pejalan kaki (misal: 0.5 meter atau 1 meter).

## 3. Output Kalkulasi (Hasil Jawaban dari "Yang Penting Berapa?")

Di layar, aplikasi akan langsung menembakkan angka hasil (*Dashboard HUD*):

1. **Radius Putar Minimum Fisik:** (Contoh: "Berdasarkan sudut roda, ART ini bisa berbelok di jalan dengan radius paling kecil **15 meter**").
2. **Radius Aman Berdasarkan Kecepatan:** (Contoh: "Karena kamu set kecepatan di 30 km/jam, radius jalan tidak boleh kurang dari **25 meter** agar kereta tidak tergelincir").
3. **Total Lebar Jalan Berbelok (Swept Path):** (Contoh: "Saat berbelok, bodi kereta akan menyapu jalan selebar **4.2 meter**. Dengan jarak aman, siapkan lajur selebar **5.2 meter**").
4. **Status Indikator Aman/Crash:** Tanda centang hijau ✅ jika jalan muat, atau tanda silang merah ❌ "CRASH" jika kereta menabrak trotoar.

## 4. Pembaruan Canvas Visualisasi 2D

* **Multi-Carriage Rendering:** Menggambar 3 kotak (gerbong) yang saling tersambung dengan engsel (titik rotasi antar gerbong).
* **Transition Curve (Kurva Transisi):** Lintasan tidak lagi dari lurus langsung melingkar, tapi menggunakan lengkung transisi (seperti setir yang diputar perlahan), membuat animasi jauh lebih realistis.
* **Garis Jejak 3 Warna:**
* Garis Merah: Jejak moncong terluar (menentukan batas trotoar luar).
* Garis Biru: Jejak roda/perut terdalam (menentukan trotoar dalam/pulau jalan).
* Garis Hijau: Lintasan tengah (*centerline*) berpola putus-putus.



## 5. Rekomendasi Algoritma untuk *Developer*

Karena kamu mungkin akan *coding* ini (mengingat *background* kamu suka eksperimen dengan web/Next.js):

1. **Fokus di Front-End:** Gunakan perhitungan **Bicycle Model** (Model Sepeda) atau *Ackermann Steering* sederhana di JavaScript untuk mensimulasikan roda depan memimpin, lalu gerbong belakang (*trailers*) menggunakan algoritma *Tractrix* atau *Follow-the-leader* (karena ART memiliki sensor optik agar roda belakang ngikutin jejak roda depan).
2. **Validasi Sentrifugal Sederhana:** Gunakan rumus $R = v^2 / (127 \times (e + f))$. Di mana $v$ adalah kecepatan (km/jam), $e$ kemiringan jalan (bisa diabaikan/dibuat 0), dan $f$ koefisien gesekan ban (sekitar 0.3).

---

Dengan PRD update ini, aplikasimu bukan cuma sekadar kalkulator statis, tapi **Simulator Geometri Jalan** yang keren banget untuk dipresentasikan! Semua variabel bisa di-*tweak*, tapi hasil akhirnya tetap satu kalimat sederhana yang dicari orang awam: *"Oh, kalau keretanya 3 gerbong jalan 20km/jam, perempatannya harus punya radius 15 meter dan lebar lajur 4 meter."*