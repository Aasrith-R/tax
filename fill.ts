import fs from "fs";
import { PDFDocument } from "pdf-lib";

async function run() {
  const template = fs.readFileSync("/Users/h/tax/public/Налоговая декларация form.pdf");

  const pdfDoc = await PDFDocument.load(template);
  const form = pdfDoc.getForm();

  // Fill fields
  form.getTextField("INN").setText("123456789012");
  form.getTextField("KPP").setText("123456789");

  // Flatten so the filled text becomes permanent
  form.flatten();

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync("/Users/h/tax/public/nds-filled.pdf", pdfBytes);

  console.log("DONE → File saved as nds-filled.pdf");
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

