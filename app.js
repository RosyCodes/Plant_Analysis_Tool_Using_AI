
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 5000;

// configure multer: save uploaded files to /upload folder & limit file file sizes
const upload = multer({ dest: "upload/" });
app.use(express.json({ limit: "10mb" }));

//initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.static("public"));

// routes
// analyze route and uses multer upload variable to save uploaded files as images
app.post("/analyze", upload.single("image"), async (req, res) => {
    const file = req.file;
    console.log(file); //use the image details for Gemini AI
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Please upload an image" });
        }
        const imagePath = req.file.path;
        const imageData = await fsPromises.readFile(imagePath, {
            encoding: "base64",
        });
        // use the gemini AI API to analyze the image
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
        });

        const result = await model.generateContent([
            "Analyze this plant image and provide detailed analysis of its species, health and care recommendations, its characteristics, care instructions and interesting facts. Please provide the response in plain text without using any markdown formatting ",
            {
                inlineData: {
                    mimeType: req.file.mimetype,
                    data: imageData,

                },
            },
        ]);
        const plantInfo = result.response.text();
        // remove the uploaded image
        await fsPromises.unlink(imagePath);
        // respond with the analysis result and the image data
        res.json({
            result: plantInfo,
            image: `data:${req.file.mimetype};base64,${imageData}`,
        });

    } catch (error) {
        console.error("Error analyzing image:", error);

        res.status(500).json({ error: "An error occured while analyzing the image." });
    }
});

// route for download pdfs
app.post("/download", express.json(), async (req, res) => {
    //res.json({ success: true });
    const { result, image } = req.body;
    try {
        // Ensure the reports directory exists
        const reportsDir = path.join(__dirname, "reports");
        await fsPromises.mkdir(reportsDir, { recursive: true });
        //generate the pdf report
        const filename = `plant_analysis_report_${Date.now()}.pdf`;
        const filePath = path.join(reportsDir, filename);
        const writeStream = fs.createWriteStream(filePath);
        const doc = new PDFDocument();
        doc.pipe(writeStream);

        // Add content to the PDF
        doc.fontSize(24).text("Plant Analysis Report", { align: "center" });
        doc.moveDown();
        doc.fontSize(14).text(`Date Generated: ${new Date().toLocaleDateString()}`);
        doc.moveDown();
        doc.fontSize(14).text(result, { align: "left" });

        // Insert image to the PDF
        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");
            doc.moveDown();
            doc.image(buffer, {
                fit: [500, 300],
                align: "center",
                valign: "center",
            });
        }
        doc.end();
        // wait for the pdf to be created
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });
        res.download(filePath, (err) => {
            if (err) {
                console.log(err);
                res.status(500).json({ error: "An error occured while generating the PDF." });
            }
            fsPromises.unlink(filePath);
        });
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ error: "An error occured while generating the PDF." });
    }
});

// start the server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});

