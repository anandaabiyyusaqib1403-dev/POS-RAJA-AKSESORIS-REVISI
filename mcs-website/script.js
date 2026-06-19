const majors = {
  digital: {
    title: "Bisnis Digital",
    description:
      "Jurusan Bisnis Digital mempelajari strategi pemasaran modern berbasis teknologi dan internet. Siswa dibekali kemampuan digital marketing, branding, social media management, e-commerce, dan content creation untuk bisnis masa kini.",
    topics: [
      "Digital Marketing",
      "Social Media Strategy",
      "Content Creation",
      "E-Commerce",
      "Branding",
      "Marketplace Management",
      "Advertising",
      "Kewirausahaan Digital",
    ],
    careers: [
      "Digital Marketer",
      "Social Media Specialist",
      "Content Creator",
      "Online Shop Manager",
      "Entrepreneur",
      "Creative Marketing Staff",
    ],
  },
  rpl: {
    title: "Rekayasa Perangkat Lunak",
    description:
      "Jurusan Rekayasa Perangkat Lunak berfokus pada pengembangan teknologi dan pemrograman komputer. Siswa mempelajari cara membuat aplikasi, website, sistem digital, serta dasar software engineering modern.",
    topics: [
      "Pemrograman Dasar",
      "Web Development",
      "Mobile App Development",
      "Database",
      "UI/UX Design",
      "Software Engineering",
      "Networking Basic",
      "System Development",
    ],
    careers: [
      "Software Developer",
      "Web Developer",
      "UI/UX Designer",
      "Mobile Developer",
      "IT Support",
      "Startup Developer",
    ],
  },
  office: {
    title: "Manajemen Perkantoran",
    description:
      "Jurusan Manajemen Perkantoran mempelajari administrasi modern dan pengelolaan kegiatan perkantoran secara profesional. Siswa dilatih dalam komunikasi, pengarsipan, pelayanan, dan administrasi perusahaan.",
    topics: [
      "Administrasi Perkantoran",
      "Kearsipan",
      "Public Relations",
      "Komunikasi Bisnis",
      "Pengelolaan Dokumen",
      "Microsoft Office",
      "Pelayanan Pelanggan",
      "Manajemen Agenda",
    ],
    careers: [
      "Staff Administrasi",
      "Sekretaris",
      "Front Office",
      "Customer Service",
      "Administrative Assistant",
      "Office Management Staff",
    ],
  },
  accounting: {
    title: "Akuntansi",
    description:
      "Jurusan Akuntansi mempelajari pengelolaan dan pencatatan keuangan perusahaan maupun lembaga. Siswa dibekali kemampuan pembukuan, laporan keuangan, analisis keuangan, dan software akuntansi.",
    topics: [
      "Akuntansi Dasar",
      "Pembukuan",
      "Laporan Keuangan",
      "Perpajakan",
      "Spreadsheet Keuangan",
      "Software Akuntansi",
      "Analisis Keuangan",
      "Administrasi Pajak",
    ],
    careers: [
      "Staff Accounting",
      "Finance Staff",
      "Tax Administration",
      "Bookkeeper",
      "Auditor Assistant",
      "Cashier Supervisor",
    ],
  },
  retail: {
    title: "Bisnis Retail",
    description:
      "Jurusan Bisnis Retail mempelajari strategi penjualan dan pengelolaan bisnis retail modern, baik offline maupun online. Siswa dibekali kemampuan pelayanan pelanggan, visual merchandising, dan manajemen toko.",
    topics: [
      "Retail Management",
      "Customer Service",
      "Product Display",
      "Sales Strategy",
      "Merchandising",
      "Cashier System",
      "Inventory Management",
      "Business Communication",
    ],
    careers: [
      "Retail Staff",
      "Store Supervisor",
      "Sales Promotion",
      "Merchandiser",
      "Entrepreneur",
      "Store Manager",
    ],
  },
  banking: {
    title: "Layanan Perbankan Syariah",
    description:
      "Jurusan Layanan Perbankan Syariah mempelajari sistem keuangan dan layanan perbankan berbasis prinsip syariah. Siswa dibekali kemampuan administrasi keuangan, pelayanan nasabah, dan operasional bank syariah.",
    topics: [
      "Dasar Perbankan",
      "Operasional Bank Syariah",
      "Akuntansi Perbankan",
      "Pelayanan Nasabah",
      "Administrasi Keuangan",
      "Transaksi Perbankan",
      "Etika Pelayanan",
      "Produk Keuangan Syariah",
    ],
    careers: [
      "Teller",
      "Customer Service Bank",
      "Staff Administrasi Bank",
      "Staff Keuangan",
      "Back Office Perbankan",
      "Layanan Keuangan Syariah",
    ],
  },
};

const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelectorAll(".site-nav a");
const majorTabs = document.querySelectorAll("[data-major]");
const majorTitle = document.querySelector("[data-major-title]");
const majorDescription = document.querySelector("[data-major-description]");
const majorTopics = document.querySelector("[data-major-topics]");
const majorCareers = document.querySelector("[data-major-careers]");

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function renderList(target, items) {
  if (!target) return;
  target.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    })
  );
}

function setMajor(key) {
  const major = majors[key] || majors.digital;
  majorTitle.textContent = major.title;
  majorDescription.textContent = major.description;
  renderList(majorTopics, major.topics);
  renderList(majorCareers, major.careers);

  majorTabs.forEach((tab) => {
    const isActive = tab.dataset.major === key;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();
setMajor("digital");

navToggle?.addEventListener("click", () => {
  const isOpen = header.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    header?.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

majorTabs.forEach((tab) => {
  tab.addEventListener("click", () => setMajor(tab.dataset.major));
});
