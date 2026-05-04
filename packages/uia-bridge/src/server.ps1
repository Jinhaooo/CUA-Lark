param(
    [string]$LarkProcessName = "Lark"
)

Add-Type @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;

public class UiaServer {
    public class JsonElement {
        public string id { get; set; }
        public string method { get; set; }
        public Dictionary<string, object> @params { get; set; }
        public Dictionary<string, object> parameters { get; set; }
    }

    public class JsonResponse {
        public string id { get; set; }
        public object result { get; set; }
        public object error { get; set; }
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    private static string GetWindowTitle(IntPtr hWnd) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        return sb.ToString();
    }

    private static AutomationElement FindLarkWindow() {
        IntPtr hwnd = GetForegroundWindow();
        uint processId;
        GetWindowThreadProcessId(hwnd, out processId);

        Process process = null;
        try {
            process = Process.GetProcessById((int)processId);
        } catch {
            return null;
        }

        if (process.ProcessName -like "*Lark*" -or process.ProcessName -like "*Feishu*" -or process.ProcessName -like "*$LarkProcessName*") {
            var condition = new PropertyCondition(AutomationElementIdentifiers.ProcessIdProperty, processId);
            return AutomationElement.RootElement.FindFirst(TreeScope.Children, condition);
        }

        return null;
    }

    private static int CountNodes(AutomationElement element, int maxCount = 1000) {
        int count = 0;
        try {
            var walker = TreeWalker.RawViewWalker;
            AutomationElement node = walker.GetFirstChild(element);
            while (node != null && count < maxCount) {
                count++;
                node = walker.GetNextSibling(node);
            }
        } catch {}
        return count;
    }

    private static string RoleToName(ControlType controlType) {
        if (controlType == ControlType.Button) return "Button";
        if (controlType == ControlType.Edit) return "Edit";
        if (controlType == ControlType.TabItem) return "TabItem";
        if (controlType == ControlType.List) return "List";
        if (controlType == ControlType.ListItem) return "ListItem";
        if (controlType == ControlType.Document) return "Document";
        if (controlType == ControlType.Text) return "Text";
        if (controlType == ControlType.Pane) return "Pane";
        if (controlType == ControlType.Window) return "Window";
        return controlType.ProgrammaticName.Replace("ControlType.", "");
    }

    private static ControlType NameToRole(string role) {
        switch ((role ?? "").ToLowerInvariant()) {
            case "button": return ControlType.Button;
            case "edit": return ControlType.Edit;
            case "tabitem": return ControlType.TabItem;
            case "list": return ControlType.List;
            case "listitem": return ControlType.ListItem;
            case "document": return ControlType.Document;
            case "text": return ControlType.Text;
            case "pane": return ControlType.Pane;
            case "window": return ControlType.Window;
            default: return ControlType.Custom;
        }
    }

    private static bool NameMatches(string actual, string pattern) {
        if (string.IsNullOrEmpty(pattern)) return true;
        actual = actual ?? "";
        try {
            return Regex.IsMatch(actual, pattern, RegexOptions.IgnoreCase);
        } catch {
            return actual.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }

    private static Dictionary<string, object> ElementToDict(AutomationElement element) {
        var dict = new Dictionary<string, object>();
        try {
            dict["name"] = element.Current.Name ?? "";
            dict["role"] = RoleToName(element.Current.ControlType);
            dict["automationId"] = element.Current.AutomationId ?? "";
            dict["hasKeyboardFocus"] = element.Current.HasKeyboardFocus;
            var rect = element.Current.BoundingRectangle;
            dict["boundingRectangle"] = new Dictionary<string, int> {
                ["x"] = (int)rect.X,
                ["y"] = (int)rect.Y,
                ["width"] = (int)rect.Width,
                ["height"] = (int)rect.Height
            };
        } catch {}
        return dict;
    }

    private static AutomationElement FindElementByRoleAndName(AutomationElement root, string role, string name, bool descendants) {
        var roleCondition = new PropertyCondition(AutomationElementIdentifiers.ControlTypeProperty, NameToRole(role));
        var scope = descendants ? TreeScope.Descendants : TreeScope.Children;
        var elements = root.FindAll(scope, roleCondition);
        foreach (AutomationElement element in elements) {
            if (NameMatches(element.Current.Name, name)) {
                return element;
            }
        }
        return null;
    }

    private static List<Dictionary<string, object>> FindAllByRole(AutomationElement root, string role, string name) {
        var results = new List<Dictionary<string, object>>();
        try {
            var roleCondition = new PropertyCondition(AutomationElementIdentifiers.ControlTypeProperty, NameToRole(role));
            var scope = TreeScope.Descendants;
            var elements = root.FindAll(scope, roleCondition);
            foreach (AutomationElement element in elements) {
                if (NameMatches(element.Current.Name, name)) {
                    results.Add(ElementToDict(element));
                }
            }
        } catch {}
        return results;
    }

    public static void Main() {
        var response = new JsonResponse();
        var line = "";

        while ((line = Read-Host) -ne null) {
            try {
                var request = JsonSerializer.Deserialize<JsonElement>(line);
                if (request == null) continue;

                response.id = request.id;
                var parameters = request.parameters != null ? request.parameters : (request.@params != null ? request.@params : new Dictionary<string, object>());

                switch (request.method) {
                    case "isA11yEnabled": {
                        var element = FindLarkWindow();
                        if (element != null) {
                            var count = CountNodes(element);
                            var result = new Dictionary<string, object> {
                                ["enabled"] = count >= 50,
                                ["nodeCount"] = count
                            };
                            response.result = result;
                        } else {
                            response.result = new Dictionary<string, object> {
                                ["enabled"] = false,
                                ["nodeCount"] = 0
                            };
                        }
                        break;
                    }

                    case "findElement": {
                        var element = FindLarkWindow();
                        if (element == null) {
                            response.result = null;
                            break;
                        }
                        var role = parameters.ContainsKey("role") ? parameters["role"].ToString() : "";
                        var name = parameters.ContainsKey("name") ? parameters["name"].ToString() : "";
                        var scope = parameters.ContainsKey("scope") ? parameters["scope"].ToString() : "descendants";
                        var found = FindElementByRoleAndName(element, role, name, scope == "descendants");
                        response.result = found != null ? ElementToDict(found) : null;
                        break;
                    }

                    case "findAll": {
                        var element = FindLarkWindow();
                        if (element == null) {
                            response.result = new List<object>();
                            break;
                        }
                        var role = parameters.ContainsKey("role") ? parameters["role"].ToString() : "";
                        var name = parameters.ContainsKey("name") ? parameters["name"].ToString() : "";
                        response.result = FindAllByRole(element, role, name);
                        break;
                    }

                    case "shutdown":
                        return;

                    default:
                        response.error = new { code = "method_not_found", message = $"Unknown method: {request.method}" };
                        break;
                }
            } catch (Exception ex) {
                response.error = new { code = "parse_error", message = ex.Message };
            }

            var json = JsonSerializer.Serialize(response);
            Write-Output json
        }
    }
}
"@

UiaServer::Main()
