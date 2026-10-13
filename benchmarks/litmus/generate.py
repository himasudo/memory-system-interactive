#!/usr/bin/env python3
"""Emit a selected two-thread herd7 test; no native execution is implied."""
import argparse


def generate(isa, case, fenced):
    if isa == 'x86':
        init = 'x=0; y=0;'
        tests = {
            'SB': ([['MOV [x],$1', 'MOV EAX,[y]'], ['MOV [y],$1', 'MOV EAX,[x]']], '0:EAX=0 /\\ 1:EAX=0'),
            'MP': ([['MOV [x],$1', 'MOV [y],$1'], ['MOV EAX,[y]', 'MOV EBX,[x]']], '1:EAX=1 /\\ 1:EBX=0'),
            'LB': ([['MOV EAX,[x]', 'MOV [y],$1'], ['MOV EAX,[y]', 'MOV [x],$1']], '0:EAX=1 /\\ 1:EAX=1'),
        }
        threads, condition = tests[case]
        if fenced:
            for thread in threads:
                thread.insert(1, 'MFENCE')
        architecture = 'X86'
    else:
        init = 'x=0; y=0;\n0:X1=x; 0:X3=y; 1:X1=y; 1:X3=x;'
        fence = ['DMB SY'] if fenced else []
        tests = {
            'SB': ([['MOV W0,#1', 'STR W0,[X1]', *fence, 'LDR W2,[X3]']] * 2, '0:X2=0 /\\ 1:X2=0'),
            'MP': ([['MOV W0,#1', 'STR W0,[X1]', *fence, 'STR W0,[X3]'], ['LDR W0,[X1]', *fence, 'LDR W2,[X3]']], '1:X0=1 /\\ 1:X2=0'),
            'LB': ([['LDR W0,[X1]', *fence, 'MOV W2,#1', 'STR W2,[X3]']] * 2, '0:X0=1 /\\ 1:X0=1'),
        }
        threads, condition = tests[case]
        architecture = 'AArch64'
    rows = ['P0'.ljust(24) + '| P1 ;']
    for i in range(max(map(len, threads))):
        cells = [thread[i] if i < len(thread) else '' for thread in threads]
        rows.append(cells[0].ljust(24) + '| ' + cells[1] + ' ;')
    return f'{architecture} {case}{"_full_fence" if fenced else ""}\n{{\n{init}\n}}\n' + '\n'.join(rows) + f'\nexists ({condition})\n'


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--isa', choices=['x86', 'aarch64'], default='x86')
    p.add_argument('--case', choices=['SB', 'MP', 'LB'], default='SB')
    p.add_argument('--fenced', action='store_true')
    args = p.parse_args()
    print(generate(args.isa, args.case, args.fenced), end='')
