using Windows.Security.Credentials.UI;

namespace Haven;

/// <summary>Windows Hello (face, fingerprint or PIN) for Haven's lock screen.</summary>
static class LockAuth
{
    public static async Task<bool> HelloAvailableAsync()
    {
        try { return await UserConsentVerifier.CheckAvailabilityAsync() == UserConsentVerifierAvailability.Available; }
        catch { return false; }
    }

    /// <summary>Shows the Windows Hello prompt over the given window; true when the user is verified.</summary>
    public static async Task<bool> VerifyAsync(IntPtr owner, string message)
    {
        try
        {
            var result = await UserConsentVerifierInterop.RequestVerificationForWindowAsync(owner, message);
            return result == UserConsentVerificationResult.Verified;
        }
        catch { return false; }
    }
}
