import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendEmail({ product = "Unknown", price = 0, profit = 0 } = {}) {
  const text = `Transaksi baru:\nProduk: ${product}\nHarga: ${new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)}\nProfit: ${new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(profit)}`;

  try {
    const info = await transporter.sendMail({
      from: `"Raja Aksesoris" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO,
      subject: "Notifikasi Transaksi POS",
      text,
    });

    console.log("Email terkirim:", info.messageId);
  } catch (error) {
    console.error("Gagal kirim email:", error);
  }
}
