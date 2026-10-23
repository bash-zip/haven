using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Haven;

/// <summary>Extracts large, alpha-correct icons for any shell item (apps, exes, folders) as PNG files.</summary>
static class ShellIcons
{
    public static bool TrySave(string parsingName, string pngPath, int size = 128, bool iconOnly = true)
    {
        if (File.Exists(pngPath)) return true;
        object? obj = null;
        try
        {
            SHCreateItemFromParsingName(parsingName, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out obj);
            var factory = (IShellItemImageFactory)obj;
            int hr = factory.GetImage(new SIZE { cx = size, cy = size },
                iconOnly ? SIIGBF.IconOnly | SIIGBF.BiggerSizeOk : SIIGBF.BiggerSizeOk, out var hbm);
            if (hr != 0 || hbm == IntPtr.Zero) return false;
            try
            {
                var bitmap = ToBitmapSource(hbm);
                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(bitmap));
                var tmp = pngPath + ".tmp";
                using (var fs = File.Create(tmp)) encoder.Save(fs);
                File.Move(tmp, pngPath, overwrite: true);
                return true;
            }
            finally { DeleteObject(hbm); }
        }
        catch
        {
            return false;
        }
        finally
        {
            if (obj != null) Marshal.ReleaseComObject(obj);
        }
    }

    static BitmapSource ToBitmapSource(IntPtr hbm)
    {
        var ds = new DIBSECTION();
        int size = Marshal.SizeOf<DIBSECTION>();
        if (GetObject(hbm, size, ref ds) != size || ds.dsBm.bmBitsPixel != 32 || ds.dsBm.bmBits == IntPtr.Zero)
        {
            var fallback = Imaging.CreateBitmapSourceFromHBitmap(hbm, IntPtr.Zero, Int32Rect.Empty,
                BitmapSizeOptions.FromEmptyOptions());
            fallback.Freeze();
            return fallback;
        }

        int w = ds.dsBm.bmWidth, h = Math.Abs(ds.dsBm.bmHeight), stride = ds.dsBm.bmWidthBytes;
        var px = new byte[stride * h];
        Marshal.Copy(ds.dsBm.bmBits, px, 0, px.Length);

        // DIB sections are bottom-up unless the header height is negative.
        if (ds.dsBmih.biHeight > 0)
        {
            var row = new byte[stride];
            for (int top = 0, bottom = h - 1; top < bottom; top++, bottom--)
            {
                Buffer.BlockCopy(px, top * stride, row, 0, stride);
                Buffer.BlockCopy(px, bottom * stride, px, top * stride, stride);
                Buffer.BlockCopy(row, 0, px, bottom * stride, stride);
            }
        }

        // Some legacy icons carry no alpha at all; treat them as fully opaque instead of invisible.
        bool hasAlpha = false;
        for (int i = 3; i < px.Length; i += 4) if (px[i] != 0) { hasAlpha = true; break; }
        if (!hasAlpha) for (int i = 3; i < px.Length; i += 4) px[i] = 255;

        var bmp = BitmapSource.Create(w, h, 96, 96, PixelFormats.Pbgra32, null, px, stride);
        bmp.Freeze();
        return bmp;
    }

    [Flags]
    enum SIIGBF { ResizeToFit = 0, BiggerSizeOk = 1, MemoryOnly = 2, IconOnly = 4 }

    [StructLayout(LayoutKind.Sequential)]
    struct SIZE { public int cx, cy; }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory
    {
        [PreserveSig] int GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct BITMAP
    {
        public int bmType, bmWidth, bmHeight, bmWidthBytes;
        public ushort bmPlanes, bmBitsPixel;
        public IntPtr bmBits;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct BITMAPINFOHEADER
    {
        public uint biSize;
        public int biWidth, biHeight;
        public ushort biPlanes, biBitCount;
        public uint biCompression, biSizeImage;
        public int biXPelsPerMeter, biYPelsPerMeter;
        public uint biClrUsed, biClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct DIBSECTION
    {
        public BITMAP dsBm;
        public BITMAPINFOHEADER dsBmih;
        public uint dsBitfield0, dsBitfield1, dsBitfield2;
        public IntPtr dshSection;
        public uint dsOffset;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out object ppv);

    [DllImport("gdi32.dll", EntryPoint = "GetObjectW")]
    static extern int GetObject(IntPtr h, int c, ref DIBSECTION pv);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr h);
}
