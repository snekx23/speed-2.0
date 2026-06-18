$TasksExtDll = "c:\Users\Gui\.gemini\antigravity\scratch\speed-logistics\npgsql3\lib\net451\System.Threading.Tasks.Extensions.dll"
$NpgsqlDll = "c:\Users\Gui\.gemini\antigravity\scratch\speed-logistics\npgsql3\lib\net451\Npgsql.dll"

[Reflection.Assembly]::LoadFrom($TasksExtDll) | Out-Null
[Reflection.Assembly]::LoadFrom($NpgsqlDll) | Out-Null

$ConnString = "Host=aws-1-sa-east-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.evupemncvectyyeoeajz;Password=SpeedLogistics2026!;SslMode=Require;Trust Server Certificate=true"
$conn = New-Object Npgsql.NpgsqlConnection($ConnString)
try {
    $conn.Open()
    Write-Host "Connected to Supabase database!"

    # Create table rider_support_messages if not exists
    $sql = @"
    CREATE TABLE IF NOT EXISTS rider_support_messages (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT now(),
      rider_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL
    );
"@
    $cmd = New-Object Npgsql.NpgsqlCommand($sql, $conn)
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "Table rider_support_messages created successfully (or already existed)!"

    # Disable RLS
    Write-Host "Disabling Row Level Security on rider_support_messages..."
    $rlsSql = "ALTER TABLE rider_support_messages DISABLE ROW LEVEL SECURITY;"
    $cmd = New-Object Npgsql.NpgsqlCommand($rlsSql, $conn)
    $cmd.ExecuteNonQuery() | Out-Null

    # Add rider_support_messages to publication supabase_realtime
    Write-Host "Adding table to publication..."
    try {
        $cmd = New-Object Npgsql.NpgsqlCommand("ALTER PUBLICATION supabase_realtime ADD TABLE rider_support_messages", $conn)
        $cmd.ExecuteNonQuery() | Out-Null
        Write-Host "Table rider_support_messages added to realtime publication!"
    } catch {
        Write-Host "Table rider_support_messages already in publication or failed: $_"
    }

    Write-Host "Migration completed successfully!"
} catch {
    Write-Error $_.Exception.Message
} finally {
    $conn.Close()
}
