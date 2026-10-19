# Alpha One — Subscriber Business Studio Architecture

**Document Type:** Product Concept & Menu Architecture
**Status:** PROPOSED — NOT YET IMPLEMENTED
**Product:** Alpha One
**Primary Users:** Marketing Professionals, Operations Professionals, Business Owners, and Teams

---

## 1. Product Vision

Alpha One Business Studio adalah area khusus untuk pelanggan yang berlangganan, tempat mereka menjalankan workflow bisnis menggunakan AI.

Tujuannya bukan sekadar menyediakan akses ke model AI, melainkan membantu pengguna menyelesaikan pekerjaan dari data mentah hingga menghasilkan insight, laporan, presentasi, dan rekomendasi tindakan.

**Core value proposition:**

> Turn business data into actionable insights, reports, and decisions.

Business Studio berfokus pada dua domain utama:

1. **Marketing Intelligence** — memahami performa marketing, mengevaluasi iklan, dan merencanakan kampanye.
2. **Operations Intelligence** — memahami performa operasional, menemukan masalah, dan memperbaiki proses kerja.

Keduanya menggunakan fondasi data analysis dan report generation yang sama.

## 2. Product Principles

1. **Outcome-first:** pengguna memilih pekerjaan yang ingin diselesaikan, bukan tool atau model AI.
2. **Guided workflow:** pengguna nonteknis dapat mengikuti proses tanpa harus menyusun prompt kompleks.
3. **One workflow, multiple outputs:** satu analisis dapat menghasilkan insight, report, dan presentation.
4. **Evidence-based:** angka dan rekomendasi harus dapat ditelusuri ke data sumber.
5. **Managed AI:** Alpha One mengelola routing model, kredensial provider, dan kontrol biaya; pengguna tidak perlu mengatur API key sendiri.
6. **Plan-aware:** setiap workflow tunduk pada entitlement, kuota, dan status subscription.
7. **Progressive capability:** mulai dari upload spreadsheet, kemudian gunakan konektor yang benar-benar tersedia.
8. **No false capability:** fitur yang belum tersedia harus ditandai sebagai Coming Soon atau tidak ditampilkan sebagai fitur aktif.
9. **No unlimited AI claims:** pemakaian mengikuti kuota dan batas biaya yang sesuai paket.
10. **Reuse existing capabilities:** audit dan gunakan kemampuan Alpha One yang sudah ada sebelum membangun ulang.

---

## 3. Navigation Architecture

Business Studio menjadi satu menu utama khusus subscriber. Domain Marketing dan Operations berada di dalamnya, bukan menjadi menu utama yang terlalu banyak.

```text
Alpha One
│
├── Existing Core Workspace
│   ├── Ask Alpha
│   ├── Existing Tools & Integrations
│   └── Resources
│
├── Business Studio                    [Subscriber Menu]
│   │
│   ├── Studio Home
│   │   ├── Recommended Workflows
│   │   ├── Recent Work
│   │   └── Start from Data
│   │
│   ├── Data & Analysis
│   │   ├── Spreadsheet Analysis
│   │   ├── Business Performance
│   │   └── Trends & Anomalies
│   │
│   ├── Marketing Intelligence
│   │   ├── Ads Performance
│   │   ├── Campaign Comparison
│   │   ├── Budget Analysis
│   │   └── Campaign Planning
│   │
│   ├── Operations Intelligence
│   │   ├── Sales & Inventory Analysis
│   │   ├── Cost & Margin Analysis
│   │   ├── SLA & Productivity
│   │   └── Process Improvement
│   │
│   ├── Reports & Presentations
│   │   ├── Generate Report
│   │   ├── Generate Slides
│   │   └── Reusable Report Workflows
│   │
│   └── My Work
│       ├── Saved Analyses
│       ├── Generated Reports
│       └── Saved Workflows
│
├── Account & Subscription
│   ├── Current Plan
│   ├── Usage & Quota
│   ├── Upgrade Plan
│   └── Billing History
│
└── Business Administration             [Business Plan]
    ├── Members
    ├── Workspace Management
    └── Team Usage & Quotas
```

**Navigation rule:** jangan menampilkan semua submenu sebagai elemen permanen pada sidebar jika membuat navigasi terlalu padat. Tampilkan Business Studio sebagai satu entry point, lalu gunakan kategori dan workflow cards di dalam halaman Studio.

Menu administrasi Business hanya tersedia bagi pengguna dengan entitlement dan role yang sesuai.

---

## 4. Business Studio Home

Studio Home adalah landing page untuk pengguna subscriber.

### 4.1 Main sections

#### A. Start a Workflow

Pengguna memilih pekerjaan yang ingin diselesaikan.

Contoh:
- Analyze my advertising performance.
- Analyze a sales spreadsheet.
- Find operational cost issues.
- Generate a monthly business report.
- Turn this analysis into a presentation.

#### B. Continue Working

Menampilkan analisis dan workflow terakhir yang dapat dilanjutkan oleh pengguna.

#### C. Recommended Workflows

Rekomendasi berdasarkan plan, fitur yang tersedia, dan jenis pekerjaan yang dipilih pengguna.

#### D. Data Sources

Menampilkan pilihan input yang benar-benar didukung:
- Upload Excel/CSV.
- Connect Google Sheets, jika integrasinya tersedia.
- Use existing authorized business integrations, jika tersedia.

#### E. Recent Outputs

Menampilkan report, slide, dan hasil analisis yang telah dibuat serta dapat diakses pengguna.

---

## 5. Core Workflow Architecture

Seluruh domain menggunakan satu workflow engine konseptual.

```text
User selects a business goal
            │
            ▼
Select or upload source data
            │
            ▼
Validate data and required fields
            │
            ▼
Determine supported analysis
            │
            ▼
Execute plan-authorized workflow
            │
            ▼
Generate findings and recommendations
            │
            ▼
User reviews the results
            │
            ├── Save analysis
            ├── Generate report
            └── Generate presentation
                        │
                        ▼
                  Review output
                        │
                        ▼
                  Save to My Work
```

### Workflow requirements

Setiap workflow harus mempunyai:

- Tujuan yang jelas.
- Input dan sumber data yang diketahui.
- Persyaratan kolom atau field.
- Validasi dan penanganan data yang tidak lengkap.
- Definisi metrik dan formula yang konsisten.
- Hasil analisis yang dapat ditelusuri ke sumber.
- Rekomendasi yang membedakan fakta dan interpretasi.
- Output yang tersedia sesuai entitlement.
- Pengendalian biaya dan kuota.
- Penanganan kegagalan yang jelas.

Tidak semua workflow harus selalu menghasilkan semua jenis output. Pilihan output bergantung pada kemampuan yang tersedia dan kebutuhan pengguna.

---

## 6. Domain A — Data & Analysis

Fondasi bersama untuk Marketing dan Operations.

### 6.1 Spreadsheet Analysis

**Objective:** mengubah spreadsheet menjadi insight yang dapat dipahami pengguna.

Capabilities:
- Membaca struktur dan tipe data.
- Mendeteksi kolom kosong, duplikat, dan inkonsistensi.
- Meringkas data menurut kategori atau periode.
- Menghitung metrik berdasarkan formula yang terdefinisi.
- Menampilkan tren dan perbandingan.
- Menjawab pertanyaan tentang dataset.

**Output:**
- Summary.
- Tables and charts.
- Data quality findings.
- Business insights.
- Recommendations.

### 6.2 Business Performance

Menganalisis KPI, perubahan performa, dan perbandingan target terhadap aktual jika target tersedia.

### 6.3 Trends & Anomalies

Mendeteksi perubahan yang signifikan berdasarkan data yang tersedia, disertai konteks dan batas interpretasi.

---

## 7. Domain B — Marketing Intelligence

### 7.1 Ads Performance

**Objective:** memahami efektivitas biaya iklan dan hasil kampanye.

Candidate metrics:
- Ad spend.
- Impressions.
- Clicks.
- CTR.
- CPC.
- Conversions.
- Conversion rate.
- CPA.
- Revenue attributed to ads.
- ROAS.

Metrik hanya dihitung apabila field dan definisinya tersedia.

### 7.2 Campaign Comparison

Membandingkan campaign berdasarkan periode, channel, produk, atau segmentasi yang tersedia.

### 7.3 Budget Analysis

Menganalisis alokasi anggaran, perubahan biaya, dan performa yang tercatat.

Rekomendasi budget merupakan usulan untuk ditinjau pengguna. Perubahan budget otomatis memerlukan integrasi, otorisasi, dan kontrol tambahan.

### 7.4 Campaign Planning

Membantu pengguna menyusun:
- Campaign brief.
- Campaign objectives.
- Content calendar.
- Creative brief.
- A/B testing plan.
- Measurement plan.

**Output utama Marketing Intelligence:**

Analysis → Findings → Recommendations → Marketing Report → Presentation.

---

## 8. Domain C — Operations Intelligence

### 8.1 Sales & Inventory Analysis

Candidate capabilities:
- Sales trend.
- Product performance.
- Inventory movement.
- Slow-moving products.
- Stockout risk, apabila data stok memadai.

### 8.2 Cost & Margin Analysis

Menganalisis biaya, pendapatan, dan margin berdasarkan field serta definisi finansial yang tersedia.

### 8.3 SLA & Productivity

Menganalisis waktu proses, backlog, keterlambatan, dan produktivitas jika dataset mempunyai timestamp serta definisi SLA yang valid.

### 8.4 Process Improvement

Membantu mengidentifikasi:
- Bottlenecks.
- Recurring operational issues.
- Process inconsistencies.
- Improvement opportunities.
- Proposed action plans.

**Output utama Operations Intelligence:**

Operational Data → Exceptions → Root-cause Hypotheses → Recommendations → Operations Report.

Alpha One harus membedakan temuan yang terbukti dari hipotesis penyebab masalah.

---

## 9. Domain D — Reports & Presentations

Report generation adalah workflow lintas domain, bukan engine terpisah untuk Marketing dan Operations.

### 9.1 Generate Report

Menghasilkan dokumen yang dapat berisi:
- Executive summary.
- Scope and data sources.
- KPI summary.
- Key findings.
- Trend analysis.
- Risks and limitations.
- Recommendations.
- Action plan.

### 9.2 Generate Slides

Mengubah analisis menjadi presentasi dengan:
- Narrative structure.
- Executive summary.
- Charts and key metrics.
- Findings and recommendations.
- Source traceability.
- Visual consistency.

Google Slides integration harus mengikuti kemampuan yang telah diuji. Fitur tambahan atau format output lain hanya ditawarkan jika tersedia.

### 9.3 Reusable Report Workflows

Pengguna dapat menggunakan ulang workflow dan struktur laporan untuk periode berikutnya.

Regenerasi tidak boleh menganggap dataset baru identik dengan dataset lama. Validasi ulang sumber dan field tetap wajib.

---

## 10. My Work

My Work adalah tempat menemukan hasil kerja, bukan salinan penuh dari semua sumber eksternal.

Candidate sections:

- Saved Analyses.
- Generated Reports.
- Generated Presentations.
- Saved Workflow Configurations.

Setiap item sebaiknya menyimpan metadata yang diperlukan:
- Owner.
- Creation date.
- Source references.
- Workflow type.
- Output location.
- Status.
- Plan or workspace context where applicable.

Sumber asli tetap berada di lokasi asalnya, misalnya Google Drive. Alpha One menyimpan atau mereferensikan output sesuai kemampuan penyimpanan dan integrasi yang benar-benar tersedia.

---

## 11. Subscription & Entitlement Model

### 11.1 Plan structure

| Plan | Positioning | Primary value |
|---|---|---|
| Free | Entry | Explore Alpha One with limited usage |
| Member | Individual productivity | Complete routine work faster |
| Pro | Advanced business workflows | Perform deeper analysis and generate business outputs |
| Business | Team productivity | Standardize workflows and manage usage across a team |

Harga kandidat dari pembahasan sebelumnya:
- Free: Rp0.
- Member: Rp99.000/bulan.
- Pro: Rp249.000/bulan.
- Business: mulai Rp599.000/bulan.

Harga tersebut belum dianggap final atau siap dipublikasikan.

### 11.2 Entitlement principles

Setiap request workflow harus dievaluasi berdasarkan:

- User identity.
- Workspace.
- Subscription status.
- Plan entitlements.
- Workflow availability.
- Usage quota.
- Cost limits.
- Access permissions.

Menu visibility bukan kontrol keamanan yang memadai. Backend harus memverifikasi entitlement sebelum menjalankan operasi yang dibatasi.

### 11.3 Managed AI usage

Alpha One mengelola pemilihan provider dan model serta pembatasan biaya.

Pengguna tidak perlu memahami API key, provider routing, atau struktur biaya internal untuk menggunakan workflow bisnis.

Tidak ada janji penggunaan AI tanpa batas.

---

## 12. Conceptual Service Architecture

```text
Alpha One UI
     │
     ▼
Business Studio
     │
     ▼
Workflow Orchestrator
     │
     ├── Entitlement & Quota Check
     │
     ├── Data Validation
     │
     ├── Analysis Workflow
     │
     ├── Marketing Workflow
     │
     ├── Operations Workflow
     │
     └── Report & Slides Workflow
                │
                ▼
        Managed AI Usage Gateway
                │
                ▼
          Authorized AI Tools
                │
                ▼
       Google Workspace / Files
                │
                ▼
          Output & Provenance
```

Diagram ini adalah logical architecture, bukan pernyataan bahwa seluruh service tersebut sudah ada sebagai komponen terpisah.

Implementasi harus terlebih dahulu mengaudit komponen Alpha One yang sudah tersedia. Jangan membuat service baru jika fungsi yang sama sudah ada dan dapat diperluas dengan aman.

---

## 13. Cross-cutting Requirements

### Data integrity
- Jangan membuat angka atau field yang tidak tersedia.
- Validasi formula dan satuan metrik.
- Simpan referensi sumber yang mendukung hasil.
- Nyatakan keterbatasan dataset.

### Privacy and security
- Terapkan akses berdasarkan user, workspace, dan role.
- Jangan membagikan output lintas workspace tanpa otorisasi.
- Minimalkan data yang dikirim ke provider.
- Lindungi credential dan integrasi eksternal.

### Usage and cost control
- Enforce quota sebelum operasi mahal.
- Catat pemakaian yang dapat direkonsiliasi.
- Terapkan batas biaya per plan.
- Tangani kegagalan provider dan retry tanpa menghitung pemakaian secara keliru.

### UX
- Gunakan istilah pekerjaan bisnis yang familiar.
- Hindari meminta pengguna memilih model AI.
- Berikan status proses dan validasi yang jelas.
- Sediakan review sebelum operasi eksternal atau perubahan data.
- Jangan menampilkan workflow sebagai tersedia jika dependensinya belum siap.

---

## 14. Implementation Phases

### Phase 0 — Existing Capability Audit

Audit navigasi, tools, integrasi, data handling, subscription state, serta report generation yang sudah ada.

**Exit criteria:** setiap capability diklasifikasikan sebagai implemented, partially implemented, missing, atau unknown.

### Phase 1 — Business Studio Entry Point

Menyediakan entry point Business Studio dan katalog workflow yang benar-benar tersedia.

### Phase 2 — Spreadsheet to Business Analysis

Menyelesaikan workflow analisis spreadsheet dengan validasi data, metrik, dan provenance.

### Phase 3 — Analysis to Reports & Slides

Menghubungkan hasil analisis dengan output report dan presentasi.

### Phase 4 — Marketing Intelligence

Menambahkan workflow marketing yang memiliki definisi metrik dan data input yang memadai.

### Phase 5 — Operations Intelligence

Memperluas workflow menggunakan fondasi analisis yang sama.

### Phase 6 — Subscription Entitlements

Menegakkan akses, kuota, dan penggunaan berdasarkan plan pada backend.

### Phase 7 — Team Capabilities

Menambahkan workflow sharing, member management, dan usage controls untuk Business apabila fondasi identity dan workspace telah siap.

Urutan ini merupakan usulan roadmap. Implementasi aktual mengikuti hasil audit dependensi dan kesiapan komponen.

---

## 15. Success Criteria

Business Studio dianggap memberikan nilai produk apabila:

1. Pengguna dapat memilih pekerjaan berdasarkan tujuan bisnis.
2. Pengguna dapat memberikan sumber data yang didukung.
3. Alpha One memvalidasi dataset sebelum analisis.
4. Hasil analisis mempunyai sumber dan batas yang jelas.
5. Hasil dapat dilanjutkan menjadi report atau presentation.
6. Workflow dapat digunakan ulang tanpa mengulang konfigurasi yang tidak perlu.
7. Plan dan kuota ditegakkan oleh sistem.
8. Pengguna memahami layanan yang tersedia pada paketnya.
9. Penggunaan model dan biaya dapat dikontrol.
10. Tidak ada fitur yang dipasarkan sebagai siap pakai sebelum dibuktikan.

---

## 16. Immediate Next Step

**Create an implementation-readiness audit before changing the application.**

Audit:
- Current navigation and sidebar.
- Existing spreadsheet and data analysis capabilities.
- Existing Google Workspace and Slides tools.
- Existing report generation and saved outputs.
- Current account, subscription, and entitlement implementation.
- Reusable components that can power Business Studio.
- Missing capabilities and integration dependencies.

Deliverable:
`ALPHA-ONE-BUSINESS-STUDIO-READINESS-AUDIT.md`

The audit must be read-only and must not introduce new menu items, database schemas, subscriptions, or workflow services.

The implementation decision follows from verified evidence, not assumptions.

---

## Final Product Direction

Business Studio should be the subscriber-facing business workflow layer of Alpha One.

Marketing and Operations are the primary domains. Data analysis is the shared foundation. Reports and presentations are reusable outputs. Subscription plans determine available capabilities, usage limits, and team controls.

The goal is a small, understandable menu that helps users complete valuable work—not a complex collection of AI tools.
