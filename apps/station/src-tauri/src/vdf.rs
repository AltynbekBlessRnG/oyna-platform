//! Разбор текстового VDF/ACF Steam: `"ключ" "значение"` и вложенные блоки `{ }`.

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Text(String),
    Block(BTreeMap<String, Value>),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            // Steam не всегда последователен в регистре ключей: "installdir" и "InstallDir".
            Value::Block(map) => map.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            Value::Text(_) => None,
        }
    }

    pub fn text(&self, key: &str) -> Option<&str> {
        match self.get(key) {
            Some(Value::Text(text)) => Some(text),
            _ => None,
        }
    }

    pub fn entries(&self) -> impl Iterator<Item = (&String, &Value)> {
        let map = match self {
            Value::Block(map) => Some(map),
            Value::Text(_) => None,
        };
        map.into_iter().flatten()
    }
}

pub fn parse(source: &str) -> Value {
    let mut tokens = tokenize(source).into_iter().peekable();
    Value::Block(parse_block(&mut tokens))
}

#[derive(Debug, PartialEq)]
enum Token {
    Text(String),
    Open,
    Close,
}

fn parse_block(tokens: &mut std::iter::Peekable<std::vec::IntoIter<Token>>) -> BTreeMap<String, Value> {
    let mut map = BTreeMap::new();
    while let Some(token) = tokens.next() {
        let key = match token {
            Token::Text(key) => key,
            Token::Close => break,
            Token::Open => continue,
        };
        match tokens.next() {
            Some(Token::Text(value)) => {
                map.insert(key, Value::Text(value));
            }
            Some(Token::Open) => {
                map.insert(key, Value::Block(parse_block(tokens)));
            }
            _ => break,
        }
    }
    map
}

fn tokenize(source: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut chars = source.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '{' => tokens.push(Token::Open),
            '}' => tokens.push(Token::Close),
            '"' => {
                let mut text = String::new();
                while let Some(ch) = chars.next() {
                    match ch {
                        '"' => break,
                        '\\' => match chars.next() {
                            Some('n') => text.push('\n'),
                            Some('t') => text.push('\t'),
                            Some(other) => text.push(other),
                            None => break,
                        },
                        other => text.push(other),
                    }
                }
                tokens.push(Token::Text(text));
            }
            '/' if chars.peek() == Some(&'/') => {
                for ch in chars.by_ref() {
                    if ch == '\n' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_library_folders_with_escaped_windows_paths() {
        let source = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps"
		{
			"730"		"35000000000"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
        let root = parse(source);
        let folders = root.get("libraryfolders").unwrap();
        let paths: Vec<_> = folders.entries().filter_map(|(_, folder)| folder.text("path")).collect();
        assert_eq!(paths, vec![r"C:\Program Files (x86)\Steam", r"D:\SteamLibrary"]);
    }

    #[test]
    fn reads_app_manifest_fields_regardless_of_key_case() {
        let source = "\"AppState\"\n{\n\t\"appid\"\t\t\"570\"\n\t\"name\"\t\t\"Dota 2\"\n\t\"InstallDir\"\t\t\"dota 2 beta\"\n\t\"StateFlags\"\t\t\"4\"\n}";
        let app = parse(source);
        let state = app.get("AppState").unwrap();
        assert_eq!(state.text("appid"), Some("570"));
        assert_eq!(state.text("installdir"), Some("dota 2 beta"));
    }
}
