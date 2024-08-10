const express = require("express");
const app = express();
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
const ANSWER_INSTRUCTIONS = `
You will be provided with a JSON file containing objects with questions in the 'titulo' property. 
Your task is to respond to each question using the format specified in the 'tipo_input' property.
- If the 'tipo_input' is 'selector', choose one of the values from the 'values' property in the same object.
- Ensure that you respond to all questions.
- You must provide responses in the same order as the questions.
- You must provide a response limited to the 'max_length' property if it exists.
- Don't be redundant in your responses relative to the question.
- All responses must be in Spanish.
`;
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(express.json());

app.post("/responder", async (req, res) => {
	const context = req.body.context;

	// console.log("BODY:", req.body.form);
	const formQuestions = await analyzeForm(req.body.form);
	console.log(formQuestions);

	let answers = await answerQuestions(formQuestions, context);
	answers = JSON.parse(answers.response.text());

	res.json(answers);
});

async function answerQuestions(formQuestions, context) {
	const prePrompt = "You must answer everything under the following context: " + context + "\n";
	const prompt = prePrompt + ANSWER_INSTRUCTIONS;

	const answerModel = genAI.getGenerativeModel({
		model: GEMINI_MODEL,
		systemInstruction: prompt,
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
	console.log(prompt);
	return await answerModel.generateContent(formQuestions);
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
