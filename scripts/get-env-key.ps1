# Retrieves DOTENV_PRIVATE_KEY from Windows Credential Manager
Import-Module CredentialManager
$cred = Get-StoredCredential -Target 'DOTENVX_PRIVATE_KEY'
if ($cred) {
    Write-Output $cred.GetNetworkCredential().Password
} else {
    Write-Error "DOTENVX_PRIVATE_KEY not found in Credential Manager"
    exit 1
}
