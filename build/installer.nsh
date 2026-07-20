!macro customHeader
  !define APP_INSTALLATION_APP_NAME "OpenScanLink"
!macroend


!macro customInit
  ; 强制将默认安装路径设置为纯英文，避免 sharp 加载 .node 文件时因中文路径乱码导致报错
  StrCpy $INSTDIR "$PROGRAMFILES64\OpenScanLink"
!macroend

!macro verifyDir
  ; 检查安装路径是否包含非 ASCII 字符 (利用 NSIS 系统插件)
  System::Call '*(&w${NSIS_MAX_STRLEN} "$INSTDIR") i .r1'
  System::Call 'kernel32::WideCharToMultiByte(i 20127, i 0, i r1, i -1, i 0, i 0, i 0, i 0) i .r2'
  System::Call 'kernel32::WideCharToMultiByte(i 65001, i 0, i r1, i -1, i 0, i 0, i 0, i 0) i .r3'
  System::Free $1
  
  ; 如果 ASCII 长度与 UTF-8 长度不一致，说明包含非纯英文（如中文）
  IntCmp $2 $r3 path_ok path_contains_non_ascii path_ok
  
path_contains_non_ascii:
  MessageBox MB_OK|MB_ICONEXCLAMATION "安装路径不能包含中文或特殊字符！$\r$\n$\r$\n当前路径: $INSTDIR$\r$\n$\r$\n请选择纯英文路径（例如: D:\EduScanLink），否则会导致扫描仪图像处理核心模块无法正常运行。"
  Abort ; 阻止继续安装，停留在选择目录界面

path_ok:
!macroend

!macro customUnInit
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "您确实要完全移除 OpenScanLink ，及其所有的组件？" IDYES +2
  Abort
  SetSilent silent
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenScanLink"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenScanLink"
!macroend