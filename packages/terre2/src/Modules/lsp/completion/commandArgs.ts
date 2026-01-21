import { MarkupContent, MarkupKind } from 'vscode-languageserver';
import { commandType } from 'webgal-parser/build/types/interface/sceneInterface';

export { commandType };

export function markdown(content: string): MarkupContent {
  return {
    kind: MarkupKind.Markdown,
    value: content,
  };
}
