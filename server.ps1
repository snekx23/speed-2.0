$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
try {
    $listener.Start()
    Write-Host "Server started and listening at http://localhost:8000/"
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        # URL decode path to handle spaces or special characters
        $path = [uri]::UnescapeDataString($path)
        if ($path -eq "/") { $path = "/index.html" }
        $webRoot = Join-Path (Get-Location) "public"
        $localPath = Join-Path $webRoot $path.TrimStart('/')

        # Security check to prevent path traversal outside of the web root
        $resolvedPath = [System.IO.Path]::GetFullPath($localPath)
        $currentDir = [System.IO.Path]::GetFullPath($webRoot)
        if (-not $resolvedPath.StartsWith($currentDir)) {
            $response.StatusCode = 403
            $buf = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
            $response.ContentLength64 = $buf.Length
            $response.OutputStream.Write($buf, 0, $buf.Length)
            $response.Close()
            continue
        }

        if (Test-Path $resolvedPath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($resolvedPath)
            $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLower()
            $mime = switch ($extension) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".gif"  { "image/gif" }
                ".svg"  { "image/svg+xml" }
                ".ico"  { "image/x-icon" }
                default { "application/octet-stream" }
            }
            $response.ContentType = $mime
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $buf.Length
            $response.OutputStream.Write($buf, 0, $buf.Length)
        }
        $response.Close()
    }
} catch {
    Write-Error $_.Exception.Message
} finally {
    $listener.Stop()
}
