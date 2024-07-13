import AdmZip from "adm-zip";
import { ManifestValidator, type Manifest } from "./Validators/Manifest";
import { object } from "zod";
import type { ContentFilter } from "./ContentFilters/ContentFilter";
import { ScriptFilter } from "./ContentFilters/ScriptFilter";
import { ResourceFilter } from "./ContentFilters/TextureFilter";
import { SkinPackFilter } from "./ContentFilters/SkinPackFilter";
import { DataPackFilter } from "./ContentFilters/DataPackFilter";
import { jsonrepair } from "jsonrepair";

class Folder {
  private zipEntries: AdmZip.IZipEntry[];
  private folderPath: string;

  constructor(entries: AdmZip.IZipEntry[], folderPath: string) {
    this.zipEntries = entries;
    this.folderPath = folderPath;
  }

  private getAbsolutePath(path: string) {
    if (this.folderPath === "") return path;
    return `${this.folderPath}/${path}`;
  }

  getEntry(name: string) {
    const path = this.getAbsolutePath(name);
    return this.zipEntries.find((entry) => entry.entryName === path);
  }
}

class ContentPack {
  private folder: Folder;
  manifest: Manifest;
  static filters: ContentFilter[] = [
    new ScriptFilter(),
    new ResourceFilter(),
    new SkinPackFilter(),
    new DataPackFilter(),
  ];

  getFolder(): Folder {
    return this.folder;
  }

  constructor(entries: Folder) {
    this.folder = entries;

    // Check if a manifest exists
    const manifestEntry = this.folder.getEntry("manifest.json");
    if (!manifestEntry) {
      throw new Error("No manifest entry found in the content pack");
    }

    try {
      const manifestText = manifestEntry.getData().toString("utf-8");
      var manifestContent = JSON.parse(jsonrepair(manifestText));
    } catch (error) {
      throw new Error("Failed to parse manifest.json: " + error);
    }

    try {
      this.manifest = ManifestValidator.parse(manifestContent);
    } catch (error) {
      throw new Error("Failed to validate manifest.json: " + error);
    }
  }

  get name(): string {
    return this.manifest.header.name;
  }

  get description(): string | undefined {
    return this.manifest.header.description;
  }

  get type(): string {
    for (const filter of ContentPack.filters) {
      if (filter.contentType === this.manifest.modules[0].type) {
        return filter.contentType;
      }
    }
    throw new Error("Unknown content type");
  }

  static async fromPackFileBuffer(buffer: Buffer): Promise<ContentPack[]> {
    // Recursively explore the zip file, looking inside folders to see if they are valid content packs
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const manifest = entries.find(
      (entry) => entry.entryName === "manifest.json"
    );

    if (manifest) {
      return [new ContentPack(new Folder(entries, ""))];
    }

    const folders: Record<string, AdmZip.IZipEntry[]> = {};

    const contentPacksFromZipFiles: ContentPack[] = [];

    for (const entry of entries) {
      if (entry.entryName.includes("/")) {
        const folder = entry.entryName.split("/")[0];
        if (!folders[folder]) {
          folders[folder] = [];
        }
        folders[folder].push(entry);
      } else {
        if (entry.entryName.endsWith(".mcpack")) {
          const data = entry.getData();
          const contentPacks = await ContentPack.fromPackFileBuffer(data);
          contentPacksFromZipFiles.push(...contentPacks);
        }
      }
    }

    const foldersArray = Object.entries(folders).map(
      ([folderpath, entries]) => {
        return new Folder(entries, folderpath);
      }
    );

    return [
      ...foldersArray.map((folder) => new ContentPack(folder)),
      ...contentPacksFromZipFiles,
    ];
  }

  static async fromFile(filePath: string) {
    const file = await Bun.file(filePath);
    if ((await file.exists()) === false)
      throw new Error(`File ${filePath} does not exist`);
    const buffer = Buffer.from(await file.arrayBuffer());
    return ContentPack.fromPackFileBuffer(buffer);
  }
}

export { ContentPack };