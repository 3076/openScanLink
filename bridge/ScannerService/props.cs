using System;
using NAPS2.Scan;

namespace ScannerService
{
    public class DumpProps
    {
        public static void Dump()
        {
            var options = new ScanOptions();
            options.KeyValueOptions.Add("ICAP_AUTOMATICDESKEW", "1");
            Console.WriteLine("KeyValueOptions added successfully");
        }
    }
}
