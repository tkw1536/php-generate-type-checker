import type { TypeNode } from '../../../parser/ast.ts';
import type { FunctionNameProposer } from './types.ts';

export class SequentialCheckNameProposer implements FunctionNameProposer {
  private next = 0;

  name(_type: TypeNode): string {
    const counter = this.next++;
    return counter === 0 ? 'check' : `check_${counter}`;
  }
}
