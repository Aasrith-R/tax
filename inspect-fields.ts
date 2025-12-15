import fs from "fs";
import { PDFDocument } from "pdf-lib";

async function run() {
  const template = fs.readFileSync("/Users/h/tax/public/Налоговая декларация form.pdf");

  const pdfDoc = await PDFDocument.load(template);
  const form = pdfDoc.getForm();

  console.log("=== PDF Form Fields ===");
  console.log(`Total fields: ${form.getFields().length}\n`);

  form.getFields().forEach((field, index) => {
    const fieldName = field.getName();
    const fieldType = field.constructor.name;
    console.log(`${index + 1}. Name: "${fieldName}" | Type: ${fieldType}`);
  });

  console.log("\n=== Field Details ===");
  form.getFields().forEach((field) => {
    const name = field.getName();
    const type = field.constructor.name;
    console.log(`\nField: "${name}"`);
    console.log(`  Type: ${type}`);
    
    if (type === "PDFTextField") {
      const textField = field as any;
      console.log(`  Value: "${textField.getText() || "(empty)"}"`);
    }
  });
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

