//! Explicit native acceptance check; never reads or overwrites the user's PAT.
//! Run with `cargo test --test native_credentials_test -- --ignored` in a real
//! Keychain/Credential Manager/Secret Service session.
#[test]
#[ignore = "requires an unlocked operating-system credential store"]
fn native_credential_store_round_trip() {
    let account = format!("native-validation-{}", uuid::Uuid::new_v4());
    let entry =
        keyring::Entry::new("com.salvatorecorvaglia.basilico.validation", &account).unwrap();
    struct Cleanup<'a>(&'a keyring::Entry);
    impl Drop for Cleanup<'_> {
        fn drop(&mut self) {
            let _ = self.0.delete_credential();
        }
    }
    let _cleanup = Cleanup(&entry);
    assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    let value = format!("disposable-{}", uuid::Uuid::new_v4());
    entry.set_password(&value).unwrap();
    assert_eq!(entry.get_password().unwrap(), value);
    entry.set_password("replacement-test-value").unwrap();
    assert_eq!(entry.get_password().unwrap(), "replacement-test-value");
    entry.delete_credential().unwrap();
    assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
}
