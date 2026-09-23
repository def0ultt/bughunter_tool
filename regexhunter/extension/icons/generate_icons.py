"""
Script to generate crisp PNG icons for the Chrome extension using pure standard library.
"""
import zlib
import struct
from pathlib import Path


def create_png(width: int, height: int, filepath: Path):
    # RGBA image buffer
    raw_data = bytearray()

    cx, cy = width / 2.0, height / 2.0
    r_outer = width * 0.46
    r_inner = width * 0.34
    r_center = width * 0.12

    for y in range(height):
        raw_data.append(0)  # Filter type 0 (None)
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            # Background: Transparent
            r, g, b, a = 0, 0, 0, 0

            # Target radar styling: Dark indigo circle with vibrant cyan crosshair and red target dot
            if dist <= r_outer:
                # Base circle
                r, g, b, a = 15, 23, 42, 255  # Deep slate (#0f172a)

                # Outer ring
                if abs(dist - r_inner) < max(1.0, width * 0.04):
                    r, g, b, a = 56, 189, 248, 255  # Cyan ring (#38bdf8)

                # Crosshairs
                if (abs(dx) < max(0.8, width * 0.03) and dist < r_inner * 1.1) or \
                   (abs(dy) < max(0.8, width * 0.03) and dist < r_inner * 1.1):
                    r, g, b, a = 56, 189, 248, 255  # Cyan crosshair

                # Center bullseye target
                if dist <= r_center:
                    r, g, b, a = 239, 68, 68, 255  # Red bullseye (#ef4444)

            raw_data.extend((r, g, b, a))

    def make_chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)

    png_header = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr_chunk = make_chunk(b"IHDR", ihdr_data)
    idat_chunk = make_chunk(b"IDAT", zlib.compress(bytes(raw_data)))
    iend_chunk = make_chunk(b"IEND", b"")

    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(png_header + ihdr_chunk + idat_chunk + iend_chunk)


if __name__ == "__main__":
    icons_dir = Path("c:/tools/bughunter_tool/regexhunter/extension/icons")
    for size in (16, 48, 128):
        create_png(size, size, icons_dir / f"icon{size}.png")
    print("Icons generated successfully!")
