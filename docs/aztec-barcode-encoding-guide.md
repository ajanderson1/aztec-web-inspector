# Aztec Barcode Encoding & Decoding

### A Practical Guide Based on ISO/IEC 24778:2008 and the ZXing Reference Implementation

---

## Table of Contents

1. [Anatomy of an Aztec Symbol](#1-anatomy-of-an-aztec-symbol)
2. [The Bull's-Eye and Mode Message](#2-the-bulls-eye-and-mode-message)
3. [Codeword Layout and Reading Direction](#3-codeword-layout-and-reading-direction)
4. [Reading Bits: The 2-Module-Wide Band](#4-reading-bits-the-2-module-wide-band)
5. [Corner Wrapping: The L-Shaped Codeword](#5-corner-wrapping-the-l-shaped-codeword)
6. [Data Encoding Modes](#6-data-encoding-modes)
7. [Mode Switching: Latches and Shifts](#7-mode-switching-latches-and-shifts)
8. [Error Correction (ECC)](#8-error-correction-ecc)
9. [Bit Stuffing](#9-bit-stuffing)
10. [Putting It All Together](#10-putting-it-all-together)

---

## 1. Anatomy of an Aztec Symbol

An Aztec barcode is built from the **centre outward**, unlike QR codes which have finder
patterns in the corners. Every Aztec symbol has three structural regions:

```
┌──────────────────────────────────────────┐
│          Data Layers (outermost)         │
│    ┌────────────────────────────────┐    │
│    │      Data Layers (inner)       │    │
│    │    ┌──────────────────────┐    │    │
│    │    │    Mode Message      │    │    │
│    │    │  ┌──────────────┐   │    │    │
│    │    │  │  Bull's-Eye  │   │    │    │
│    │    │  │  (Finder)    │   │    │    │
│    │    │  └──────────────┘   │    │    │
│    │    └──────────────────────┘    │    │
│    └────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

| Region | Purpose |
|--------|---------|
| **Bull's-Eye** | Central finder pattern; concentric rings of alternating black/white modules |
| **Mode Message** | Metadata ring immediately surrounding the bull's-eye |
| **Data Layers** | Concentric rings carrying data and error correction codewords |

There are two symbol types:

| Type | Bull's-Eye Size | Max Layers | Mode Message Bits |
|------|----------------|------------|-------------------|
| **Compact** | 5 x 5 (2 rings) | 4 | 28 |
| **Full** | 7 x 7 (3 rings) | 32 | 40 |

The decoder distinguishes compact from full by the geometry of the finder pattern itself.

---

## 2. The Bull's-Eye and Mode Message

### Orientation

The bull's-eye includes **orientation marks** at its corners and edges. These allow
the decoder to determine the symbol's rotation and identify which corner is "top-left."
All subsequent reading is relative to this established orientation.

### Mode Message Contents

The mode message is a small, fixed-format data stream encoded in the modules directly
around the bull's-eye. It always uses **4-bit codewords** over **GF(16)**, regardless of
symbol size. It tells the decoder two critical things:

#### Compact Aztec (28 bits total)

| Field | Bits | Meaning |
|-------|------|---------|
| Layers | 2 | Number of data layers (value + 1, so 0-3 encodes 1-4) |
| Data codewords | 6 | Number of data codewords (value + 1) |
| *Reed-Solomon check* | *20* | *Error correction for the above 8 bits* |

#### Full Aztec (40 bits total)

| Field | Bits | Meaning |
|-------|------|---------|
| Layers | 5 | Number of data layers (value + 1, so 0-31 encodes 1-32) |
| Data codewords | 11 | Number of data codewords (value + 1) |
| *Reed-Solomon check* | *24* | *Error correction for the above 16 bits* |

### Why This Matters

From just these two values, the decoder derives everything it needs:

- **Layer count** determines the grid size and total bit capacity
- **Data codeword count** tells the decoder where data ends and error correction begins
- The **remaining capacity** (total codewords minus data codewords) is entirely
  Reed-Solomon check words

> The mode message is always decoded first. Without it, the rest of the symbol
> is uninterpretable.

---

## 3. Codeword Layout and Reading Direction

### Starting Point

Reading begins at the **top-left corner** of the **outermost data layer**. The top-left
is determined by the orientation marks embedded in the bull's-eye.

### Direction: Counterclockwise, Spiraling Inward

Bits are read in a **counterclockwise** path around each layer, then the process
steps inward to the next layer, repeating until the innermost layer is reached:

```
          ← ← ← ← ← ← ← ←
          ↓ ← ← ← ← ← ← ↑
          ↓ ↓            ↑ ↑
    START ↓ ↓            ↑ ↑
    ↓     ↓ ↓  Bull's-  ↑ ↑
    ↓     ↓ ↓   Eye     ↑ ↑
    ↓     ↓ ↓            ↑ ↑
    ↓     ↓ → → → → → → ↑ ↑
    ↓                      ↑
    → → → → → → → → → → → →
```

Each layer is traversed in four legs:

| Leg | Direction | Side |
|-----|-----------|------|
| 1 | Top to Bottom | Left side |
| 2 | Left to Right | Bottom side |
| 3 | Bottom to Top | Right side |
| 4 | Right to Left | Top side |

After completing all four legs of a layer (one full counterclockwise loop), the
reader steps inward and repeats on the next layer.

### Corner Ownership

Each corner belongs to the **next side** in the counterclockwise traversal:

| Corner | Belongs To |
|--------|-----------|
| Top-left | Left side (it's the starting point) |
| Bottom-left | Bottom side |
| Bottom-right | Right side |
| Top-right | Top side |

This means each side starts at a corner and ends just before the next one.

---

## 4. Reading Bits: The 2-Module-Wide Band

Each data layer is a ring that is **2 modules wide**. At every position along a side,
the decoder reads **2 bits** — one from the outer module and one from the inner module:

- **Outer** = the module farther from the bull's-eye
- **Inner** = the module closer to the bull's-eye

The outer bit is **always read first**.

### Example: Left Side (Reading Top to Bottom)

```
      outer   inner
      (col₀)  (col₁)
        │       │
        ▼       ▼
       [0]     [1]    ← position 0
       [2]     [3]    ← position 1
       [4]     [5]    ← position 2
       [6]     [7]    ← position 3
        ⋮       ⋮
```

### What "Outer" and "Inner" Mean on Each Side

The meaning of outer/inner rotates with the side:

| Side | Outer Module | Inner Module | Reading Direction |
|------|-------------|-------------|-------------------|
| **Left** | Left column (edge of symbol) | Right column | Top to Bottom |
| **Bottom** | Bottom row (edge of symbol) | Row above | Left to Right |
| **Right** | Right column (edge of symbol) | Left column | Bottom to Top |
| **Top** | Top row (edge of symbol) | Row below | Right to Left |

> **Key insight:** "Outer" always means the module closest to the edge of the symbol,
> and "inner" always means the module closest to the bull's-eye centre.

### From Grid to Stream

After reading every module from every layer in this order, the result is one long,
flat bit array. Codewords are simply **consecutive N-bit slices** of this array. The
physical layout (sides, corners, layers) is invisible at the codeword level.

---

## 5. Corner Wrapping: The L-Shaped Codeword

Since codewords are just consecutive slices of the bit stream, a single codeword
can straddle a corner — its bits physically form an **L-shape** on the grid. No
special handling occurs; the stream simply continues from one side to the next.

### Anatomy of a Corner Crossing (Bottom-Left)

Here is a 10-bit codeword split across the left side (4 bits) and bottom side (6 bits):

```
              col₀    col₁
              (out)   (in)

 left side      0       1       ← second-to-last position, reading ↓
 (reading ↓)    2       3       ← last position of left side
                ── corner ──
                5       7    9  ← bottom inner row (closer to centre)
                4       6    8  ← bottom outer row (edge of symbol)
 bottom side    →       →    →  (reading left to right)
```

**Linear bit-stream order: `0 1 2 3 4 5 6 7 8 9`**

What happens at the turn:

1. Bits `0-3` are read going **down** the left side in outer-inner pairs
2. The stream crosses the corner without interruption
3. Bits `4-9` continue going **right** along the bottom in outer-inner pairs
4. "Outer" shifts from meaning "left column" to meaning "bottom row"

### Layer Boundaries

The same principle applies when the stream crosses from one layer to the next inner
layer. The last bits of the top side (final leg of the outer layer) are immediately
followed by the first bits of the left side (first leg of the next inner layer). A
codeword can span two layers without any special encoding.

```
... Layer N, top side (last bits)  |  Layer N+1, left side (first bits) ...
        ← ← [cw end]             →  [cw start] ↓ ↓
```

> **The decoder doesn't see geometry.** It sees a linear bit stream. Codewords are
> just N-bit windows sliding across that stream.

---

## 6. Data Encoding Modes

Aztec uses a **multi-mode character encoding** system. The same binary codeword means
different things depending on which mode is currently active.

### The Five Character Modes (Plus Binary)

| Mode | Bits per Codeword | Primary Characters |
|------|------------------|--------------------|
| **UPPER** | 5 | `SPACE`, `A`-`Z` |
| **LOWER** | 5 | `SPACE`, `a`-`z` |
| **DIGIT** | 4 | `SPACE`, `0`-`9`, `,`, `.` |
| **MIXED** | 5 | Control characters (`NUL`, `CR`, `LF`, etc.), symbols (`@`, `\`, `^`, `\|`, `~`) |
| **PUNCT** | 5 | Common punctuation, two-character pairs (`. `, `, `, `CR/LF`) |
| **BINARY** | 8 | Raw bytes, any value `0x00`-`0xFF` |

### Character Tables

#### UPPER Mode (5-bit)

| Code | Char | Code | Char | Code | Char | Code | Char |
|------|------|------|------|------|------|------|------|
| 0 | *PS* | 8 | G | 16 | O | 24 | W |
| 1 | SP | 9 | H | 17 | P | 25 | X |
| 2 | A | 10 | I | 18 | Q | 26 | Y |
| 3 | B | 11 | J | 19 | R | 27 | Z |
| 4 | C | 12 | K | 20 | S | 28 | *LL* |
| 5 | D | 13 | L | 21 | T | 29 | *ML* |
| 6 | E | 14 | M | 22 | U | 30 | *DL* |
| 7 | F | 15 | N | 23 | V | 31 | *BS* |

> *Italicised entries* are control codes for mode switching (see [Section 7](#7-mode-switching-latches-and-shifts)).
> **PS** = Punct Shift, **LL** = Latch Lower, **ML** = Latch Mixed,
> **DL** = Latch Digit, **BS** = Binary Shift.

#### LOWER Mode (5-bit)

| Code | Char | Code | Char | Code | Char | Code | Char |
|------|------|------|------|------|------|------|------|
| 0 | *PS* | 8 | g | 16 | o | 24 | w |
| 1 | SP | 9 | h | 17 | p | 25 | x |
| 2 | a | 10 | i | 18 | q | 26 | y |
| 3 | b | 11 | j | 19 | r | 27 | z |
| 4 | c | 12 | k | 20 | s | 28 | *US* |
| 5 | d | 13 | l | 21 | t | 29 | *ML* |
| 6 | e | 14 | m | 22 | u | 30 | *DL* |
| 7 | f | 15 | n | 23 | v | 31 | *BS* |

> **US** = Upper Shift (temporary, one character only).

#### DIGIT Mode (4-bit)

| Code | Char | Code | Char | Code | Char | Code | Char |
|------|------|------|------|------|------|------|------|
| 0 | *PS* | 4 | 2 | 8 | 6 | 12 | `,` |
| 1 | SP | 5 | 3 | 9 | 7 | 13 | `.` |
| 2 | 0 | 6 | 4 | 10 | 8 | 14 | *UL* |
| 3 | 1 | 7 | 5 | 11 | 9 | 15 | *US* |

> **UL** = Upper Latch (permanent return to UPPER mode).

#### MIXED Mode (5-bit)

| Code | Char | Code | Char | Code | Char | Code | Char |
|------|------|------|------|------|------|------|------|
| 0 | *PS* | 8 | BS | 16 | DLE | 24 | `\` |
| 1 | NUL | 9 | HT | 17 | DC1 | 25 | `^` |
| 2 | SOH | 10 | LF | 18 | DC2 | 26 | `_` |
| 3 | STX | 11 | VT | 19 | DC3 | 27 | `` ` `` |
| 4 | ETX | 12 | FF | 20 | DC4 | 28 | *LL* |
| 5 | EOT | 13 | CR | 21 | `@` | 29 | *UL* |
| 6 | ENQ | 14 | SO | 22 | NAK | 30 | *PL* |
| 7 | ACK | 15 | SI | 23 | `\|` | 31 | *BS* |

> **PL** = Punct Latch.

#### PUNCT Mode (5-bit)

| Code | Char | Code | Char | Code | Char |
|------|------|------|------|------|------|
| 0 | *FLG(n)* | 11 | `$` | 22 | `'` |
| 1 | CR | 12 | `/` | 23 | `(` |
| 2 | CR LF | 13 | `+` | 24 | `)` |
| 3 | `. ` | 14 | `"` | 25 | `*` |
| 4 | `, ` | 15 | `\|` | 26 | `+` |
| 5 | `: ` | 16 | `#` | 27 | `;` |
| 6 | `!` | 17 | `&` | 28 | `<` |
| 7 | `"` | 18 | `'` | 29 | `=` |
| 8 | `#` | 19 | `(` | 30 | `>` |
| 9 | `$` | 20 | `)` | 31 | *UL* |
| 10 | `%` | 21 | `*` | | |

> **FLG(n)** is used for Extended Channel Interpretation (ECI) — a mechanism to
> switch character sets (e.g., UTF-8, ISO-8859-1).

---

## 7. Mode Switching: Latches and Shifts

The interpretation of every codeword depends on the **currently active mode**. Mode
changes happen through two mechanisms:

### Latches (Permanent)

A **latch** changes the active mode for all subsequent codewords until another latch
is encountered. Think of it as flipping a switch.

```
... [UPPER data] [UPPER data] [LL] [LOWER data] [LOWER data] [LOWER data] ...
                                ↑
                         Latch to Lower
                   (all subsequent codewords are LOWER)
```

### Shifts (Temporary)

A **shift** changes the mode for **only the next single codeword**, then automatically
reverts to the previously latched mode. Think of it as holding a button.

```
... [UPPER data] [PS] [PUNCT data] [UPPER data] ...
                  ↑         ↑            ↑
              Punct      One char     Back to UPPER
              Shift      in PUNCT     automatically
```

### Available Transitions

Not every mode can latch or shift to every other mode directly. Some transitions
require passing through an intermediate mode:

#### Direct Latches

```
UPPER ──LL──→ LOWER
UPPER ──ML──→ MIXED
UPPER ──DL──→ DIGIT

LOWER ──ML──→ MIXED
LOWER ──DL──→ DIGIT

MIXED ──LL──→ LOWER
MIXED ──UL──→ UPPER
MIXED ──PL──→ PUNCT

DIGIT ──UL──→ UPPER

PUNCT ──UL──→ UPPER
```

#### Indirect Latches (Two Steps)

| From | To | Path |
|------|----|------|
| UPPER | PUNCT | UPPER → ML → MIXED → PL → PUNCT |
| LOWER | UPPER | LOWER → ML → MIXED → UL → UPPER |
| DIGIT | LOWER | DIGIT → UL → UPPER → LL → LOWER |

#### Shifts

| From | Shift To | Code |
|------|----------|------|
| UPPER | PUNCT | PS (code 0) |
| LOWER | PUNCT | PS (code 0) |
| LOWER | UPPER | US (code 28) |
| MIXED | PUNCT | PS (code 0) |
| DIGIT | PUNCT | PS (code 0) |
| DIGIT | UPPER | US (code 15) |

### Binary Shift

The **BS** (Binary Shift) control code enters binary mode for a specified number of
raw bytes. It uses a tiered length encoding:

| Length Range | Encoding |
|-------------|----------|
| 1-31 bytes | 5-bit length value |
| 32-62 bytes | 5-bit `00000` + 5-bit value (length = value + 31) |
| 63-2078 bytes | 5-bit `00000` + 11-bit value (length = value + 31) |

Each byte is then read as 8 raw bits from the stream.

### Encoding Optimisation

ZXing's `HighLevelEncoder` uses **dynamic programming** to find the near-optimal
encoding. For each character position, it evaluates every possible combination of
latches, shifts, and binary shifts to minimise the total bit count. Special
two-character pairs in PUNCT mode (like `CR LF`, `. `, `, `) provide compression
for common sequences.

---

## 8. Error Correction (ECC)

**ECC** stands for **Error Correction Code** (also "Error Correcting Code"). Aztec
uses **Reed-Solomon (RS)** error correction, the same family of codes used in
CDs, DVDs, QR codes, and deep-space communication.

### How Reed-Solomon Works (High Level)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  Data         │     │  RS Encoder  │     │  Data  +  Check Words    │
│  Codewords    │ ──→ │  (division   │ ──→ │  (transmitted together)  │
│               │     │   over GF)   │     │                          │
└──────────────┘     └──────────────┘     └──────────────────────────┘
```

1. **Encoding:** The data codewords are treated as coefficients of a polynomial.
   This polynomial is divided by a *generator polynomial* over a Galois Field,
   producing **check codewords** that are appended to the data.

2. **Transmission:** The combined data + check codewords are written into the
   barcode's data layers.

3. **Decoding:** The decoder evaluates **syndromes** from the received codewords.
   If all syndromes are zero, no errors occurred. If non-zero, the decoder uses
   the **Berlekamp-Massey algorithm** to locate errors and **Forney's formula** to
   calculate their magnitude, correcting them in place.

4. **Capacity:** RS can correct up to **t** codeword errors, where **2t** equals the
   number of check codewords.

### Galois Fields by Layer Count

The codeword size (and therefore the Galois Field) scales with symbol size:

| Layers | Codeword Size | Galois Field | Primitive Polynomial |
|--------|--------------|--------------|---------------------|
| 1-2 | 6-bit | GF(64) | x^6 + x + 1 |
| 3-8 | 8-bit | GF(256) | x^8 + x^5 + x^3 + x^2 + 1 |
| 9-22 | 10-bit | GF(1024) | x^10 + x^3 + 1 |
| 23-32 | 12-bit | GF(4096) | x^12 + x^6 + x^5 + x^3 + 1 |
| *Mode message* | *4-bit* | *GF(16)* | *x^4 + x + 1* |

> **Why different fields?** Larger symbols have more codewords, requiring larger field
> sizes to uniquely address every possible error position. A GF(2^n) field supports
> up to 2^n - 1 codewords.

### Error Correction Percentage

The ISO/IEC 24778:2008 standard recommends a **minimum of 23% + 3 words** of error
correction. ZXing defaults to **33%**, providing a robust margin:

```
Total codewords  =  Data codewords  +  Check codewords
                                        └── ≈33% of total
```

The exact number of check words is determined by:

```
EC bits  =  data bits  ×  EC percentage / 100  +  11
```

The `+ 11` ensures a minimum correction capability even for very small symbols.

---

## 9. Bit Stuffing

Before Reed-Solomon encoding, a **bit stuffing** step prevents forbidden codeword
values. In Aztec, codewords of **all-zeros** and **all-ones** are reserved and must
never appear in the data stream.

### How It Works

For each codeword-sized chunk of the bit stream:

| Condition | Action |
|-----------|--------|
| Top N-1 bits are all `1` | Emit those bits + force a `0` as the Nth bit; back up 1 bit |
| Top N-1 bits are all `0` | Emit those bits + force a `1` as the Nth bit; back up 1 bit |
| Otherwise | Emit the codeword unchanged |

The "back up 1 bit" effectively inserts a complement bit to break the forbidden
pattern, slightly expanding the stream.

### Example (6-bit codewords)

```
Original bits:    1 1 1 1 1 | 0 1 0 ...
                  ─────────
                  Top 5 bits are all 1 → forbidden pattern!

Stuffed output:   1 1 1 1 1 0 | ... (complement bit inserted)
                            ↑
                       Stuff bit (forced 0)
```

### Unstuffing (Decoding Side)

After Reed-Solomon correction, the decoder reverses the process. If a codeword's
value equals `1` or `mask - 1` (where mask = 2^N - 1), the last bit is a stuff bit
and is discarded, yielding N-1 data bits of all-zeros or all-ones respectively.

A codeword value of exactly `0` or exactly `mask` after RS correction indicates a
**format error** — these values should never survive the unstuffing check.

---

## 10. Codewords vs Symbols: A Critical Distinction

This is the single most important concept for understanding Aztec barcode internals,
and it's easy to conflate the two.

### Codewords (Error Correction Units)

**Codewords** are fixed-width bit groups used for **Reed-Solomon error correction**.
Their size depends on the number of layers:

| Layers | Codeword Size |
|--------|--------------|
| 1 | 6-bit |
| 2 | 6-bit |
| 3-8 | 8-bit |
| 9-22 | 10-bit |
| 23-32 | 12-bit |

The flat bit stream extracted from the grid is sliced into consecutive codewords.
Each module belongs to exactly one codeword. These are the units that Reed-Solomon
operates on — it corrects *codewords*, not individual bits.

### Symbols (Character Encoding Units)

**Symbols** are variable-width bit groups used for **character encoding**. Their
size depends on the currently active mode:

| Mode | Symbol Size |
|------|------------|
| UPPER | 5-bit |
| LOWER | 5-bit |
| MIXED | 5-bit |
| PUNCT | 5-bit |
| DIGIT | 4-bit |
| BINARY | 8-bit |

After error correction, the corrected data codewords are concatenated back into a
bit stream, and *symbols* are read from it sequentially. Each symbol is looked up
in the current mode's character table.

### Why They Don't Align

Since codeword size (6/8/10/12) and symbol size (4/5/8) are independent, symbols
almost never align with codeword boundaries. A single codeword can contain parts
of multiple symbols, and a single symbol can span two codewords.

#### Example: 8-bit Codewords, UPPER Mode (5-bit Symbols)

```
Bit stream:  |  CW #0 (8 bits)  |  CW #1 (8 bits)  |  CW #2 (8 bits)  |
             |← 'D' (5) →|← L/L  |  (5) →|← 'i' (5) →|← 'd' | (5) →|...
             |  sym 0     |  sym 1          |  sym 2     |  sym 3       |

CW #0 contains: all of sym 0 + first 3 bits of sym 1
CW #1 contains: last 2 bits of sym 1 + all of sym 2 + first 1 bit of sym 3
CW #2 contains: last 4 bits of sym 3 + first 4 bits of sym 4
```

In this example, codeword #1 contributes bits to **three** different symbols.
Hovering over codeword #1 and showing "one character" would be misleading.

#### When Do They Align?

Only in specific cases:

| Codeword Size | Mode | Symbols per Codeword | Aligned? |
|--------------|------|---------------------|----------|
| 6 | UPPER/LOWER/MIXED/PUNCT (5-bit) | 1.2 | No |
| 8 | UPPER/LOWER/MIXED/PUNCT (5-bit) | 1.6 | No |
| 10 | UPPER/LOWER/MIXED/PUNCT (5-bit) | 2.0 | **Yes** (2 per CW) |
| 12 | UPPER/LOWER/MIXED/PUNCT (5-bit) | 2.4 | No |
| 8 | BINARY (8-bit) | 1.0 | **Yes** (1 per CW) |

Even in aligned cases (10-bit CW + 5-bit symbols), mode switches mid-codeword
(from 5-bit to 4-bit DIGIT mode) immediately break alignment.

### Implications for Visual Inspection

When building a barcode inspector:

1. **Codeword boundaries** are meaningful for error correction analysis — which
   modules form each RS codeword, where data ends and ECC begins.

2. **Symbol boundaries** are meaningful for content analysis — which modules
   contribute to each decoded character, what mode transitions occur.

3. **These are different overlays.** A useful inspector should track both:
   - Module → codeword mapping (fixed, determined by grid geometry)
   - Module → symbol mapping (requires decoding the bit stream to know where
     variable-width symbol boundaries fall)

> **Inspector design note:** To map modules to symbols, you must track the bit
> positions consumed by each symbol read. Since symbol `N` might start at bit
> offset 23 and end at bit offset 27 (spanning codewords #2 and #3), you need
> both the bit-level position in the stream and the module-to-bit mapping from
> the grid geometry.

---

## 11. Putting It All Together

Here is the complete decode pipeline, from camera image to decoded text:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  1. DETECT                                                      │
  │     Locate bull's-eye → determine compact/full → find corners   │
  │     → establish orientation → compute transformation matrix     │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  2. READ MODE MESSAGE                                           │
  │     Read modules around bull's-eye → RS decode over GF(16)     │
  │     → extract: number of layers + number of data codewords     │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  3. EXTRACT BITS                                                │
  │     For each layer (outermost → innermost):                    │
  │       For each side (left↓, bottom→, right↑, top←):           │
  │         For each position along the side:                      │
  │           Read outer module, then inner module                 │
  │     Result: one flat bit array                                 │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  4. SLICE INTO CODEWORDS                                        │
  │     Select codeword size (6/8/10/12-bit) based on layer count  │
  │     Slice bit array into consecutive N-bit codewords           │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  5. REED-SOLOMON ERROR CORRECTION                               │
  │     Select Galois Field based on codeword size                 │
  │     Correct up to t errors (2t = number of check codewords)    │
  │     Discard check codewords, keep data codewords               │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  6. UNSTUFF BITS                                                │
  │     Remove stuffing bits from corrected data codewords         │
  │     Result: clean data bit stream                              │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  7. DECODE DATA                                                 │
  │     Concatenate data codewords back into a bit stream          │
  │     Start in UPPER mode                                        │
  │     Read variable-width SYMBOLS from the bit stream:           │
  │       Read 5 bits (or 4 in DIGIT mode)                         │
  │       If control code → latch/shift/binary-shift               │
  │       If character → look up in current mode's table           │
  │     Note: symbols ≠ codewords (see Section 10)                 │
  │     Result: decoded text string                                │
  └─────────────────────────────────────────────────────────────────┘
```

### Encode Pipeline (Reverse)

Encoding follows the exact reverse path:

1. **Encode data** — optimal mode selection via dynamic programming
2. **Stuff bits** — prevent forbidden codeword patterns
3. **Reed-Solomon encode** — append check codewords
4. **Map to grid** — write bits counterclockwise, outermost layer first,
   outer-then-inner within each 2-module-wide band
5. **Add mode message** — write layer count and data codeword count around bull's-eye
6. **Draw finder** — render bull's-eye with orientation marks

---

## References

- **ISO/IEC 24778:2008** — Information technology, Automatic identification and data
  capture techniques, Aztec Code bar code symbology specification
- **ZXing** ("Zebra Crossing") — Open-source barcode library,
  `core/src/main/java/com/google/zxing/aztec/`
  - `decoder/Decoder.java` — bit extraction, RS decoding, character table decoding
  - `encoder/Encoder.java` — RS encoding, bit stuffing, grid writing
  - `encoder/HighLevelEncoder.java` — mode optimisation, character maps, latch/shift tables
  - `encoder/State.java` — dynamic programming state machine for optimal encoding
