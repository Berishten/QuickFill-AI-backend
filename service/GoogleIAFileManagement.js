async function getFileByName(fileId, fileManager) {
	try {
		const getResponse = await fileManager.getFile(fileId);
		console.log(
			`Retrieved file ${getResponse.displayName} as ${getResponse.uri}`
		);
		return getResponse;
	} catch (error) {
		console.error(`Error retrieving file ${fileId}: ${error}`);
		return false;
	}
}

async function listFiles(fileManager) {
	try {
		const listResponse = await fileManager.listFiles();
		return listResponse;
	} catch (error) {
		return false;
	}
}

async function deleteFile(fileId, fileManager) {
	try {
		// TODO: ese id debe ser guardado en una bd propia, asociado a un usuario
		const file = await getFileByName(fileId, fileManager);
		if (!file) {
			return false;
		}
		const deleteResponse = await fileManager.deleteFile(file.name);
		console.log(`Deleted file ${fileId}: ${deleteResponse}`);
		return true;
	} catch (error) {
		console.error(`Error deleting file ${fileId}: ${error}`);
		return false;
	}
}

async function uploadFile(fileInfo, fileManager) {
	try {
		const uploadResponse = await fileManager.uploadFile(fileInfo.path, {
			mimeType: "application/pdf",
			displayName: fileInfo.filename,
		});
		console.log(`Uploaded file ${fileInfo.filename} as ${uploadResponse.uri}`);
		return uploadResponse;
	} catch (error) {
		console.error(`Error uploading file ${fileInfo.filename}: ${error}`);
		return false;
	}
}

module.exports = {
	getFileByName,
	listFiles,
	deleteFile,
	uploadFile,
};
