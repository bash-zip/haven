using System.Runtime.InteropServices;

namespace HavenSetup;

/// <summary>The modern Vista folder picker (IFileDialog), so no WinForms dependency.</summary>
public static class FolderPicker
{
    const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40;
    const uint SIGDN_FILESYSPATH = 0x80058000;

    public static string? Show(IntPtr owner, string initial)
    {
        try
        {
            var dlg = (IFileDialog)new FileOpenDialogRCW();
            dlg.GetOptions(out var opts);
            dlg.SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
            dlg.SetTitle("Choose where Haven should be installed");
            if (Directory.Exists(initial))
            {
                SHCreateItemFromParsingName(initial, IntPtr.Zero, typeof(IShellItem).GUID, out var folder);
                dlg.SetFolder(folder);
            }
            if (dlg.Show(owner) != 0) return null; // cancelled
            dlg.GetResult(out var result);
            result.GetDisplayName(SIGDN_FILESYSPATH, out var path);
            return string.IsNullOrEmpty(path) ? null : path;
        }
        catch { return null; }
    }

    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    class FileOpenDialogRCW { }

    [ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr hwndOwner);
        void SetFileTypes(uint count, IntPtr filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        [PreserveSig] int SetOptions(uint options);
        [PreserveSig] int GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, int mode);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string ext);
        void Close(int hr);
        void SetClientGuid(in Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }

    [ComImport, Guid("43826D3E-E722-426A-8FC9-40A95EB0F26E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        void BindToHandler(IntPtr pbc, in Guid bhid, in Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem parent);
        [PreserveSig] int GetDisplayName(uint name, [MarshalAs(UnmanagedType.LPWStr)] out string displayName);
        void GetAttributes(uint mask, out uint attrs);
        void Compare(IShellItem other, uint hint, out int order);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, in Guid riid, out IShellItem item);
}
