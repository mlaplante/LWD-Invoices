<?php

/**
 * Based on http://www.iamcal.com/publish/articles/php/search/pdf/ By Cal Henderson
 * by Zack Kitzmiller
 * TODO Reduce queries on search from N+N to N+1
 * TODO Limit/Offset
 */

class Search {

    private $_table = null;
    private $_columns = array();

    /**
     * Split Terms
     *
     * Here we are going to remove whitespace so that we can
     * find quoted search terms.
     *
     * @access Private
     * @param array of search terms
     * @return array of search terms for use in other methods
     */
    private static function _split_terms($terms) {
        $callback = function($matches) {
            $term = preg_replace_callback("/(\s)/", function($submatches) {
                debug($submatches);
                return '{WHITESPACE-' . ord($submatches[1]) . '}';
            }, $matches[0]);
            return $term;
        };

        $terms = preg_replace_callback('/"(.*?)"/', $callback, $terms);
        $terms = preg_split("/\s+|,/", $terms);

        $out = array();
        foreach ($terms as $term) {
            $term = preg_replace_callback("/\{WHITESPACE-([0-9]+)\}/", function($matches) {
                debug($matches[1]);
                return chr($matches[1]);
            }, $term);
            $out[] = $term;
        }

        return $out;
    }

    /**
     * Escape for RLIKE
     *
     * escape all of the characters that MySQL will barf on
     *
     * @access Private
     * @param string a single search term
     * @return escaped string
     */
    private static function _escape_rlike($string)
    {
        return preg_replace("/([.\\[\\]*^\\$\\(\\)+])/", '\\\$1', $string);
    }

    /**
     * DB Escape Terms
     *
     * Prepare the terms to be used with MySQL Regex
     * Which isn't quite 'perl' like.
     * Also add the [[:<:]] operators
     *
     * @access Private
     * @param array of search terms
     * @return search term array for MySQL Regex
     */
    private static function _db_escape_terms($terms)
    {
        $out = array();
        foreach($terms as $term)
        {
            $term = str_ireplace('"', '', $term);

            if (substr($term, 0, 1) == "#") {
                $term = substr($term, 1);
            }

            if (!empty($term)) {
                $out[] = addslashes(self::_escape_rlike($term));
            }
        }
        return $out;
    }

    /**
     * RX Escape Terms
     *
     * Escape the MySQL Regex to work with Preg Match
     *
     * @access Private
     * @param array of search terms
     * @return escaped terms ready for preg_match
     */
    private static function _rx_escape_terms($terms)
    {
        $out = array();
        foreach($terms as $term) $out[] = '\b'.preg_quote($term, '/').'\b';
        return $out;
    }

    /**
     * Rank Results
     *
     * Use a custom sort function to order results by a score
     *
     * @access Private
     * @param set of objects
     * @return a sorted set of results
     */
    private static function _rank_results($results)
    {
        $sorter = function($a, $b) {
            if ($a->score === $b->score) {
                return 0;
            }

            return ($a->score > $b->score) ? -1 : 1;
        };

        usort($results, $sorter);
        return $results;
    }

    /**
     * Set the table that we want to search.
     *
     * @access Public
     * @param String
     * @return None
     */
    public function set_table($table)
    {
        $this->_table = $table;
    }

    /**
     * Set the columns that we want to search.
     *
     * @access Public
     * @param String or Array
     * @return None
     */
    public function set_columns($columns)
    {
        $this->_columns = (is_array($columns)) ? $columns : array($columns);
    }

    /**
     * Execute a search query.
     *
     * @access Public
     * @param String
     * @return results of query
     * TODO, allow override of column and table names
     */
    public function execute($terms, $limit = 20, $offset = 0)
    {
        $ci         = get_instance();
        $terms      = self::_split_terms($terms);
        $terms_db   = self::_db_escape_terms($terms);
        $terms_rx   = self::_rx_escape_terms($terms);

        // build out the sql.
        $parts = array();

        $like_str = '(';
        foreach($this->_columns as $column)
        {
            $like_str .= $column . " RLIKE '{{TERM}}'";
            if ($column !== end($this->_columns)) $like_str .= ' OR ';
        }
        $like_str .= ')';

        foreach($terms_db as $term_db)
        {
            $_str = str_replace('{{TERM}}', $term_db, $like_str);
            $parts[] = $_str;
        }

        // place an AND between each part in the array
        $parts = implode(' AND ', $parts);
		if($offset == 0) $offset = '0';
        $sql = "SELECT * FROM {$this->_table} WHERE {$parts} LIMIT $offset, $limit";
        //execute the query
        $query  = $ci->db->query($sql);
        $ret    = $query->result();

        $results = array();

        // score all of posts based on number of occurances of each search term
        foreach ($ret as $r)
        {
            $r->score = 0;
            foreach ($terms_rx as $term_rx)
            {
                foreach ($this->_columns as $column)
                {
                    $r->score += preg_match_all("/$term_rx/i", $r->$column, $null);
                }
            }
            $results[] = $r;
        }

        // we don't need this right now.
        unset($ret);

        $results = self::_rank_results($results);
        return $results;
    }
}