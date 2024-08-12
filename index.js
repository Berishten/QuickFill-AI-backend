const express = require("express");
const app = express();
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const {
	getFileByName,
	listFiles,
	deleteFile,
	uploadFile,
} = require("./service/GoogleIAFileManagement");

const { GoogleAIFileManager } = require("@google/generative-ai/server");
const {
	GoogleGenerativeAI,
	FunctionDeclarationSchemaType,
} = require("@google/generative-ai");

require("dotenv").config();
const GEMINI_MODEL = "gemini-1.5-flash";
const ANALYZE_INSTRUCTIONS = `
You are an expert in analyzing web forms that contain ('title' - 'input_type') pairs.
You will be provided with a form, and your task is to identify and list all the ('title' - 'input_type') pairs present.

1. Identification:
   - You can identify titles using attributes such as 'for', 'name', or by inferring them based on proximity to the corresponding input.

2. Input types:
   - 'input_type' can only have one of the following values based on inference: 'text', 'number', or 'select'.

3. Input type validation:
   - The input type must match the restrictions indicated by the title or nearby validation elements 
     (such as error messages or attributes related to type restrictions).

4. Select inputs:
   - When 'input_type' is 'select', you must store the values of each of its <option> elements in a property called 'values'.

5. Restrictions:
   - You must provide the 'max_length' property for all input types if there is a character limit.
`;
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(express.json());

app.post("/responder", async (req, res) => {
	const context = req.body.context;
	const fileUri = req.body.fileUri;

	// console.log("BODY:", req.body.form);
	const formQuestions = await analyzeForm(req.body.form);
	console.log("FORMULARIO:" , formQuestions);

	let answers = await answerQuestions(formQuestions, context, fileUri);

	if (!answers) {
		res.status(500).json({ message: "Error answering questions" });
		return;
	}

	answers = JSON.parse(answers.response.text());
	console.log("Respuestas:", answers);
	res.status(200).json(answers);
});

// Configuración de multer para almacenar archivos
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, "uploads/"); // Carpeta donde se guardarán los archivos
	},
	filename: (req, file, cb) => {
		cb(null, file.originalname); // Nombre del archivo con timestamp
	},
});

const upload = multer({ storage: storage });
app.post("/upload", upload.single("file"), async (req, res) => {
	if (!req.file) {
		res.status(400).json({ message: "No file uploaded" });
		return;
	}

	let fileInfo = {
		filename: req.file.filename,
		path: req.file.path,
		mimeType: req.file.mimetype,
	};

	// Se sube el archivo a Google
	const uploadResponse = await uploadFile(fileInfo, fileManager);
	if (!uploadResponse) {
		res.status(500).json({ message: "Error uploading file" });
		return;
	}

	// Se elimina la copia local
	await fs
		.unlink(fileInfo.path)
		.then(() => {
			fileInfo.message = "Invalid file type";
		})
		.catch((err) => {
			fileInfo.message = err;
		});

	res.json({
		message: "Uploaded successfully",
		file: { name: fileInfo.filename, uri: uploadResponse.file.uri },
	});

	// res.json({
	// 	file: {
	// 		name: "CV_GEN PABLO ESCOBAR VEGA .pdf",
	// 		uri: "https://generativelanguage.googleapis.com/v1beta/files/mf80ou002742",
	// 	},
	// });
});

app.delete("/deleteAll", async (req, res) => {
	const files = await listFiles(fileManager);
	if (!files || !files.files) {
		res.status(404).json({ message: "Files not found" });
		return;
	}

	for (let file of files.files) {
		await deleteFile(file.name, fileManager);
	}

	res.json({ message: "Deleted all files successfully" });
});

app.delete("/delete/:fileid", async (req, res) => {
	const fileId = req.params.fileid;
	const deleteResponse = await deleteFile(fileId, fileManager);
	if (!deleteResponse) {
		res.status(404).json({ message: "File not found" });
		return;
	}
	res.json({ message: "Deleted successfully" });
});

app.get("/list", async (req, res) => {
	let files = await listFiles(fileManager);
	if (!files || !files.files) {
		res.status(404).json({ message: "Files not found" });
		return;
	}
	res.json(files);
});

app.get("/file/:fileId", async (req, res) => {
	const fileId = req.params.fileId;
	const file = await getFileByName(fileId, fileManager);
	console.log("FILE:", file);
	if (!file) {
		res.status(404).json({ message: "File not found" });
		return;
	}
	res.json(file);
});

async function answerQuestions(formQuestions, context, fileUri) {
	const prePrompt = context;

	const answerModel = genAI.getGenerativeModel({
		model: GEMINI_MODEL,
		generationConfig: {
			responseMimeType: "application/json",
			responseSchema: {
				type: FunctionDeclarationSchemaType.ARRAY,
				items: {
					type: FunctionDeclarationSchemaType.STRING,
				},
			},
		},
	});

	let prompt = [];
	if (fileUri && fileUri.trim() != "") {
		console.log("Utilizando contexto de archivo");
		prompt.push({ text: "You will base your answers on the following file" });
		prompt.push({
			fileData: {
				mimeType: "application/pdf",
				fileUri: fileUri,
			},
		});
	}
	
	prompt.push({ text: prePrompt });
	prompt.push({
		text: `Recibirás un JSON que contiene un arreglo de objetos con la siguiente estructura:
[
	{"title": "titulo1", "input_type": "text", "max_length": 100},
	{"title": "titulo2", "input_type": "number"},
	{"title": "titulo3", "input_type": "select", "values": ["valor1", "valor2", "valor3", "valor4"]},
	{"title": "titulo4", "input_type": "text"}
]
### Tarea:
1. Para cada objeto en el arreglo:
	- Responde al contenido del campo "title" de acuerdo con las siguientes restricciones:
		- "input_type": Responde utilizando el tipo de dato especificado.
		- Si el "input_type" es "text", tu respuesta debe ser un texto con una longitud máxima definida por la propiedad "max_length" (si está presente).
		- Si el "input_type" es "number", tu respuesta debe ser un número.
		- Si el "input_type" es "select", tu respuesta debe ser uno de los valores especificados en la propiedad "values".
		- "max_length": Si la propiedad "max_length" está presente y el "input_type" es "text", asegúrate de que la respuesta no exceda esta longitud.
2. Ejemplo de Respuesta:
[
	"respuesta dentro del límite de 100 caracteres",
	42,
	"valor2",
	"otro texto"
]
Asegúrate de que cada respuesta cumpla estrictamente con los requisitos definidos por el input_type y, cuando aplique, por max_length o values.`,
	});

	prompt.push({ text: formQuestions });
	console.log(prompt);

	try {
		const result = await answerModel.generateContent(prompt);
		return result;
	} catch (error) {
		console.log("Error:", error);
		return false;
	}
}

async function analyzeForm(form) {
	let analyzingModel = genAI.getGenerativeModel({
		model: GEMINI_MODEL,
		systemInstruction: ANALYZE_INSTRUCTIONS,
		generationConfig: {
			responseMimeType: "application/json",
			responseSchema: {
				type: FunctionDeclarationSchemaType.ARRAY,
				items: {
					type: FunctionDeclarationSchemaType.OBJECT,
					properties: {
						title: {
							type: FunctionDeclarationSchemaType.STRING,
						},
						input_type: {
							type: FunctionDeclarationSchemaType.STRING,
						},
						values: {
							type: FunctionDeclarationSchemaType.ARRAY,
							items: {
								type: FunctionDeclarationSchemaType.STRING,
							},
						},
						max_length: {
							type: FunctionDeclarationSchemaType.NUMBER,
						},
					},
				},
			},
		},
	});

	const result = await analyzingModel.generateContent(form);
	return result.response.text();
}

app.listen(3000, () => {
	console.log("Servidor Express escuchando en el puerto 3000");
});
