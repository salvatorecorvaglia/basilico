fn main() {
    tauri_build::build();

    // Tauri embeds this dependency in the app executable, but Cargo's
    // integration-test executables need it too (rfd imports TaskDialogIndirect).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        let manifest =
            std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("test.manifest");
        std::fs::write(&manifest, include_str!("test.manifest"))
            .expect("write integration-test manifest");
        println!("cargo:rerun-if-changed=test.manifest");
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        // Keep XML out of linker arguments: MSVC response-file parsing splits
        // the quoted MANIFESTDEPENDENCY value at spaces.
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
