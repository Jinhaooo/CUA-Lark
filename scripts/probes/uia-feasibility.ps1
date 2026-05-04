Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class User32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetTopWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

function GetFeishuWindowHandle {
    $feishuProcess = Get-Process | Where-Object { $_.ProcessName -eq "Feishu" } | Select-Object -First 1
    if (-not $feishuProcess) {
        Write-Host "Feishu process not found"
        return $null
    }
    
    $targetPid = $feishuProcess.Id
    Write-Host "Feishu PID: $targetPid"
    
    $hwnd = [User32]::GetTopWindow([IntPtr]::Zero)
    while ($hwnd -ne [IntPtr]::Zero) {
        if ([User32]::IsWindowVisible($hwnd)) {
            $windowPid = 0
            [User32]::GetWindowThreadProcessId($hwnd, [ref]$windowPid)
            if ($windowPid -eq $targetPid) {
                Write-Host "Found Feishu window handle: $hwnd"
                return $hwnd
            }
        }
        $hwnd = [User32]::GetWindow($hwnd, 2)
    }
    
    Write-Host "Feishu window not found"
    return $null
}

function GetElementInfo($element, $depth = 0) {
    if (-not $element) { return $null }
    
    $name = $element.Current.Name
    $nameDisplay = if ($name.Length -gt 20) { "<text len=$($name.Length)>" } else { $name }
    
    return [PSCustomObject]@{
        Depth = $depth
        ControlType = $element.Current.ControlType.LocalizedControlType
        Name = $nameDisplay
        AutomationId = $element.Current.AutomationId
        BoundingRectangle = "($($element.Current.BoundingRectangle.X), $($element.Current.BoundingRectangle.Y), $($element.Current.BoundingRectangle.Width), $($element.Current.BoundingRectangle.Height))"
        HasKeyboardFocus = $element.Current.HasKeyboardFocus
    }
}

function TraverseTreeWithWalker($rootElement, $depth = 0, $maxDepth = 5) {
    if (-not $rootElement -or $depth -gt $maxDepth) { return @() }
    
    $results = @()
    $info = GetElementInfo $rootElement $depth
    if ($info) { $results += $info }
    
    try {
        $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
        $child = $walker.GetFirstChild($rootElement)
        
        while ($child -ne $null) {
            $results += TraverseTreeWithWalker $child ($depth + 1) $maxDepth
            $child = $walker.GetNextSibling($child)
        }
    } catch {
        Write-Host "Error traversing tree: $_"
    }
    
    return $results
}

function FindElementsByCondition($root, $controlTypeName, $namePattern) {
    $controlType = $null
    switch ($controlTypeName) {
        "Button" { $controlType = [System.Windows.Automation.ControlType]::Button }
        "Edit" { $controlType = [System.Windows.Automation.ControlType]::Edit }
        "TabItem" { $controlType = [System.Windows.Automation.ControlType]::TabItem }
        default { return @() }
    }
    
    $typeCondition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        $controlType
    )
    
    $results = @()
    try {
        if ($namePattern) {
            $nameCondition = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty,
                $namePattern,
                [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
            )
            $condition = [System.Windows.Automation.AndCondition]::new($typeCondition, $nameCondition)
            $found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        } else {
            $found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $typeCondition)
        }
        
        foreach ($elem in $found) {
            $info = GetElementInfo $elem
            if ($info) { $results += $info }
        }
    } catch {
        Write-Host "Error finding elements: $_"
    }
    return $results
}

Write-Host "=== UIA Feasibility Probe ==="
Write-Host "Date: $(Get-Date)"
Write-Host ""

Write-Host "=== Finding Feishu Window ==="
$hwnd = GetFeishuWindowHandle

if (-not $hwnd) {
    Write-Host "ERROR: Feishu window not found"
    exit 1
}

$feishuWindow = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
Write-Host "Window Title: $($feishuWindow.Current.Name)"
Write-Host "Window Bounds: $($feishuWindow.Current.BoundingRectangle)"
Write-Host ""

Write-Host "=== Traversing UIA Tree (max depth 5) ==="
$treeElements = TraverseTreeWithWalker $feishuWindow 0 5

$buttonCount = ($treeElements | Where-Object { $_.ControlType -eq "Button" }).Count
$editCount = ($treeElements | Where-Object { $_.ControlType -eq "Edit" }).Count
$tabCount = ($treeElements | Where-Object { $_.ControlType -eq "TabItem" }).Count

Write-Host "Tree Depth: 5"
Write-Host "Total Nodes: $($treeElements.Count)"
Write-Host "Button Count: $buttonCount"
Write-Host "Edit Count: $editCount"
Write-Host "TabItem Count: $tabCount"
Write-Host ""

$outputPath = "traces/probes/uia-tree-l1.txt"
New-Item -ItemType Directory -Path "traces/probes" -Force | Out-Null
$treeElements | Format-Table -AutoSize | Out-File -FilePath $outputPath -Encoding utf8
Write-Host "UIA Tree saved to: $outputPath"
Write-Host ""

Write-Host "=== L2: Key Element Identifiability ==="
$targets = @(
    @{ DisplayName = "MessageTab"; ControlType = "Button"; NamePattern = "*Message*" },
    @{ DisplayName = "CalendarTab"; ControlType = "Button"; NamePattern = "*Calendar*" },
    @{ DisplayName = "DocsTab"; ControlType = "Button"; NamePattern = "*Doc*" },
    @{ DisplayName = "SearchBox"; ControlType = "Edit"; NamePattern = "*Search*" },
    @{ DisplayName = "SendButton"; ControlType = "Button"; NamePattern = "*Send*" }
)

Write-Host "Finding target elements..."
foreach ($target in $targets) {
    $found = FindElementsByCondition $feishuWindow $target.ControlType $target.NamePattern
    Write-Host "$($target.DisplayName): Found $($found.Count) matches"
    foreach ($f in $found) {
        Write-Host "  - Name: $($f.Name), Bounds: $($f.BoundingRectangle)"
    }
}

Write-Host ""
Write-Host "=== L1 Decision ==="
if ($treeElements.Count -ge 50 -and ($buttonCount + $editCount) -ge 5) {
    Write-Host "RESULT: L1 PASSED"
} else {
    Write-Host "RESULT: L1 WARNING - Tree may be incomplete (a11y may not be enabled)"
}

Write-Host ""
Write-Host "=== UIA Tree Preview (first 30 elements) ==="
$treeElements | Select-Object -First 30 | Format-Table -AutoSize