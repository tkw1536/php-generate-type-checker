import type { TypeNode } from '../../../parser/ast.ts';
import {
  aliasToIsName,
  proposeIsStyleName,
} from '../../../parser/entryNames.ts';
import type { FunctionNameProposer } from './types.ts';

export type { FunctionNameProposer } from './types.ts';
export { aliasToIsName };

export class IsStyleFunctionNameProposer implements FunctionNameProposer {
  name(type: TypeNode): string {
    return proposeIsStyleName(type);
  }
}
