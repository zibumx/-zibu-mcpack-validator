import type { ContentPack } from "../ContentPack";

abstract class ContentFilter {
    abstract contentType: string;
    abstract filter(content: ContentPack): Promise<true | string>;
}

export { ContentFilter };