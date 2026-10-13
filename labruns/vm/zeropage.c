/* zeropage.c - where the shared zero page is. A load from a fresh anonymous page maps the zero
   page, and pagemap gives its frame number. /proc/iomem (root) shows where the kernel's own
   code and data sit in physical memory; the kernel defines the zero page (empty_zero_page) in
   its bss.
   Build: gcc -O2 -o zeropage zeropage.c      Run as root: ./zeropage */
#include "../common/lab.h"

int main(void)
{
    char line[256];
    volatile char *p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    char x = p[0];
    show_pagemap("after one load from a fresh page", (void *)p);
    FILE *f = fopen("/proc/iomem", "r");
    while (f && fgets(line, sizeof line, f))
        if (strstr(line, "Kernel")) printf("/proc/iomem: %s", line);
    if (f) fclose(f);
    return x;
}
