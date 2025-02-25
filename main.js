const { Plugin, Notice, Modal, ButtonComponent, TextComponent, TFile } = require("obsidian");

class PreviewRenameModal extends Modal {
    constructor(app, timestamp, file, onConfirm) {
        super(app);
        this.timestamp = timestamp;
        this.file = file;
        this.onConfirm = onConfirm;
        this.customName = "";
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Preview Rename" });

        const inputContainer = contentEl.createDiv();
        inputContainer.addClass("rename-file-modal");

        const customNameInput = new TextComponent(inputContainer)
            .setPlaceholder("Enter name here")
            .setValue(this.customName)
            .onChange((value) => {
                this.customName = value;
                this.updatePreview();
            });
        
        customNameInput.inputEl.addClass("rename-file-input");

        const previewContainer = contentEl.createDiv();
        previewContainer.addClass("preview-container");
        previewContainer.createEl("span", { text: "Preview: ", cls: "preview-label" });
        this.previewText = previewContainer.createEl("span", { cls: "preview-text" });
        this.updatePreview();

        const buttonContainer = contentEl.createDiv();
        buttonContainer.addClass("rename-file-buttons");

        new ButtonComponent(buttonContainer)
            .setButtonText("Confirm")
            .setCta()
            .onClick(() => this.confirmAction());

        new ButtonComponent(buttonContainer)
            .setButtonText("Cancel")
            .onClick(() => this.cancelAction());

        customNameInput.inputEl.focus();

        this.contentEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.confirmAction();
            } else if (event.key === "Escape") {
                this.cancelAction();
            }
        });
    }

    updatePreview() {
        const previewName = this.customName.trim()
            ? `${this.customName}-${this.timestamp}-${this.getCustomSuffix()}`
            : `name-${this.timestamp}-${this.getCustomSuffix()}`;
        this.previewText.textContent = previewName;
    }

    getCustomSuffix() {
        const ext = this.file.extension.toLowerCase();
        const baseName = this.file.name.toLowerCase();

        if (baseName.endsWith(".excalidraw") || baseName.endsWith(".excalidraw.md")) {
            return "fig";
        }
        if (ext === "md") {
            return "note";
        }
        if (["png", "jpg", "jpeg", "gif"].includes(ext)) {
            return "image";
        }
        if (["mp3", "m4a", "wav"].includes(ext)) {
            return "audio";
        }

        return "file";
    }

    confirmAction() {
        if (!this.customName.trim()) {
            new Notice("Please enter a name");
            return;
        }
        const finalName = `${this.customName}-${this.timestamp}-${this.getCustomSuffix()}`;
        this.onConfirm(finalName);
        this.close();
    }

    cancelAction() {
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

module.exports = class RenameFilesPlugin extends Plugin {
    async onload() {
        this.activationTime = Date.now();
        this.processedFiles = new Set();

        this.registerEvent(
            this.app.vault.on("create", (file) => {
                if (file instanceof TFile && !this.processedFiles.has(file.path)) {
                    this.handleFileEvent(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (file instanceof TFile) {
                    this.processedFiles.delete(file.path);
                }
            })
        );

        this.cleanupInterval = setInterval(async () => {
            for (const filePath of this.processedFiles) {
                const exists = await this.app.vault.adapter.exists(filePath);
                if (!exists) {
                    this.processedFiles.delete(filePath);
                }
            }
        }, 10000);
    }

    shouldProcessFile(file) {
        // Evitar que tanto .excalidraw como .excalidraw.md sean procesados.
        if (file.extension === 'md' && file.name.endsWith('.excalidraw.md')) {
            const baseName = file.name.replace('.md', '');
            if (this.processedFiles.has(file.parent.path + '/' + baseName)) {
                return false; // Si ya se procesó el archivo base, no procesar el .md
            }
        }

        if (this.processedFiles.has(file.path)) {
            return false;
        }

        if (file.name.match(/\d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}/)) {
            return false;
        }

        if (file.stat.ctime < this.activationTime) {
            return false;
        }

        return true;
    }

    async handleFileEvent(file) {
        if (!this.shouldProcessFile(file)) {
            return;
        }

        setTimeout(async () => {
            if (!(await this.app.vault.adapter.exists(file.path))) {
                this.processedFiles.delete(file.path);
                return;
            }

            this.processedFiles.add(file.path);

            const now = new Date();
            const formatter = new Intl.DateTimeFormat('fr-CA', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(now);

            const timestamp = formatter.replace(/[- :]/g, '').replace('h','').replace('min','').replace('s','');
            const extension = file.extension;

            new PreviewRenameModal(
                this.app,
                timestamp,
                file,
                (finalName) => this.renameFile(file, finalName)
            ).open();
        }, 200);
    }

    async renameFile(file, newName) {
        try {
            const newPath = `${file.parent.path}/${newName}.${file.extension}`;

            if (await this.app.vault.adapter.exists(newPath)) {
                new Notice(`File ${newName}.${file.extension} already exists`);
                return;
            }

            await this.app.fileManager.renameFile(file, newPath);

            this.processedFiles.delete(file.path);
            this.processedFiles.add(newPath);

            new Notice(`Renamed to ${newName}.${file.extension}`);
        } catch (error) {
            new Notice(`Error renaming file: ${error.message}`);
        }
    }

    onunload() {
        clearInterval(this.cleanupInterval);
    }
};
