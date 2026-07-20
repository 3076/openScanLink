using System;
using System.Reflection;
using NAPS2.Scan;

namespace ReflectTool {
    class Program {
        static void Main() {
            Console.WriteLine("=== ScanController Methods ===");
            foreach(var m in typeof(ScanController).GetMethods()) {
                Console.WriteLine(m.Name);
            }
        }
    }
}
