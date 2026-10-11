; electron-builder picks this file up automatically as build/installer.nsh and
; `!include`s it into the generated installer.nsi, before .onInit. It is only
; compiled into the installer, never into the uninstaller (installer.nsi guards
; the customInit hook with `!ifdef BUILD_UNINSTALLER`), so nothing here can fire
; while WordDesk is removing itself.
;
; What it does: running the setup file again on a machine that already has
; WordDesk used to silently uninstall the old copy and drop the new one in
; its place. That is a fine update, but it hides what it is doing, so someone who
; meant to "repair" or "remove" gets a surprising reinstall instead of being
; asked. This adds the missing question.
;
; The three outcomes are spelled out with explicit ${If}s rather than relying on
; MessageBox's return-check labels to cover all of them. MessageBox only accepts
; two return-check pairs, which leaves "Cancel" as an unmatched return that falls
; through to whatever comes next - and if that next line is ever not a quit, the
; installer reinstalls over the top while the operator believes they cancelled.

!macro customInit
  ; initMultiUser has already run by this point, so $INSTDIR is pointing at the
  ; existing install (per-user or per-machine) when there is one, and at the
  ; default install folder when there is not. Both uninstall registry keys are
  ; checked because either install mode could have been used previously.
  ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${EndIf}

  ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R1 == ""
    ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}

  ; A leftover uninstaller entry with no install folder is not an installation we
  ; can repair or remove, so leave it to the normal install path. IfFileExists is
  ; a core NSIS command, so this needs no extra include to be available here.
  ${If} $R0 == ""
    Goto wd_install_fresh
  ${EndIf}
  ${If} $R1 == ""
    Goto wd_install_fresh
  ${EndIf}
  IfFileExists "$R1\${APP_EXECUTABLE_FILENAME}" 0 wd_install_fresh

  ; /SD only supplies the default answer in a SILENT run - it is ignored when the
  ; dialog is shown. Two paths reach here:
  ;   - silent: electron-updater applies a differential update with /S, so /SD
  ;     IDYES makes it repair and nobody has to answer a dialog.
  ;   - not silent: updater.js calls quitAndInstall(false, true), which passes
  ;     --updated --force-run WITHOUT /S, so this question really does appear
  ;     mid-service and waits for a click. Verified: a silent repair (--updated
  ;     /S /SD IDYES /D=<dir>) returns 0, rewrites app.asar and the exe, and
  ;     leaves the uninstaller in place. The wording is what the operator needs
  ;     there - "Repair or update" is the answer an update wants, and it explains
  ;     why a second installer appeared at all. Do not "fix" this by hiding the
  ;     prompt: a silent overwrite tells nobody their app was replaced.
  ; Only one return-check pair, for the branch that is not the default. Everything
  ; after it is decided by the answer in $0, so no outcome depends on falling
  ; through.
  MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
    "WordDesk is already installed on this computer.$\n$\n\
Yes - Repair or update: reinstall over the existing copy$\n\
No - Uninstall: remove WordDesk and stop$\n\
Cancel - Do nothing and close this installer$\n$\n\
Your Bible, hymns, service plans and preferences are kept either way." \
    /SD IDYES IDYES wd_choice_repair

  ${If} $0 == "IDNO"
    ; Copy the uninstaller out of the folder it is about to run from, the same
    ; way the built-in upgrade path does, then let it remove the app with the
    ; user's data left alone.
    InitPluginsDir
    CopyFiles /SILENT "$R0" "$PLUGINSDIR\wd-old-uninstaller.exe"
    ExecWait '"$PLUGINSDIR\wd-old-uninstaller.exe" /S _?=$R1' $R3
    Delete "$PLUGINSDIR\wd-old-uninstaller.exe"
    ${If} $R3 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "WordDesk could not be uninstalled (error $R3). Nothing has been changed."
    ${EndIf}
    SetErrorLevel 0
    Quit
  ${EndIf}

  ; Cancel, and anything unexpected, must change nothing.
  SetErrorLevel 0
  Quit

  wd_choice_repair:
  ; Overwrite unconditionally so a repair really puts back files that were deleted
  ; or corrupted, and land on the folder that is already installed instead of
  ; offering a fresh one further down the wizard.
  SetOverwrite on
  SetOutPath "$R1"
  StrCpy $INSTDIR "$R1"
  Return

  wd_install_fresh:
  ; Nothing installed, or a stale uninstaller entry: install normally.
  SetOverwrite off
!macroend

!macro customInstall
  ; Clean up legacy shortcuts from before rebranding to WordDesk
  Delete "$DESKTOP\WorshipDesk.lnk"
  Delete "$SMPROGRAMS\WorshipDesk.lnk"

  ; Update or clean legacy Taskbar pinned shortcut so it automatically points to WordDesk
  IfFileExists "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\WorshipDesk.lnk" 0 +3
    Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\WorshipDesk.lnk"
    CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\WordDesk.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; Clean up legacy WorshipDesk installation folder if it exists
  IfFileExists "$LOCALAPPDATA\Programs\worshipdesk\*.*" 0 +3
    ExecWait '"$LOCALAPPDATA\Programs\worshipdesk\Uninstall WorshipDesk.exe" /S _?=$LOCALAPPDATA\Programs\worshipdesk'
    RMDir /r "$LOCALAPPDATA\Programs\worshipdesk"

  IfFileExists "$PROGRAMFILES\WorshipDesk\*.*" 0 +3
    ExecWait '"$PROGRAMFILES\WorshipDesk\Uninstall WorshipDesk.exe" /S _?=$PROGRAMFILES\WorshipDesk'
    RMDir /r "$PROGRAMFILES\WorshipDesk"
!macroend